'use strict'
//
// TrainerRed - subreddit submission analysis bot
// ---
// @copyright (c) 2014-2015 Damian Bushong <katana@odios.us>
// @license MIT license
// @url <https://github.com/damianb/>
// @reddit <https://reddit.com/u/katana__>
// @twitter <https://twitter.com/blazingcrimson>
//

var	fs = require('fs'),
	path = require('path'),
	pExec = require('child_process').execSync,
	nconf = require('nconf'),
	sqlite = require('sqlite3').verbose(),
	pkg = require(__dirname + '/../package.json'),
	snoocore = require('snoocore'),
	when = snoocore.when

function TrainerRed(configName, dbName) {
	nconf
		.argv()
		.env()
		.file({ file: __dirname + '/../' + (configName || 'config.json') })

	var api = {},
		subreddit = nconf.get('subreddit'),
		exitOnError = nconf.get('fatalOnError'),
		// general purpose var here for query depth, maximum fetch size (reddit only allows up to 100, mind)
		depth = 200,
		maxFetch = 100

	// some call this "error handling"
	// i call it "drop that shit like it's hot"
	var onError = api.onError = function(error, crit) {
		console.error(error.stack || error)
		if (exitOnError === true || crit === true) {
			process.exit(1)
		}
	}

	// instances of important things.
	var db = new sqlite.Database(__dirname + '/../' + (dbName || 'trainerred.db')),
		reddit = new snoocore({
			userAgent: 'TrainerRed v' + pkg.version + ' - /r/' + subreddit,
			throttle: 5000, // bigger delay for our script, since we're querying harder than most things do
			login: {
				username: nconf.get('user:name'),
				password: nconf.get('user:password'),
			},
			oauth: {
				type: 'script',
				consumerKey: nconf.get('consumer:key'),
				consumerSecret: nconf.get('consumer:secret'),
				scope: [
					'identity',
					'read',
					'history',
					'modlog',
					'privatemessages'
				]
			}
		})

	var sha = '',
		nodeBinary = path.basename(process.execPath)
	if(fs.existsSync(path.normalize(__dirname + '/../.git'))) {
		try {
			sha = '(' + pExec('git rev-parse HEAD', { cwd: path.normalize(__dirname + '/../'), timeout: 500 }).slice(0,8) + ')'
		} catch(e) {}
	}

	// expose when, sr info
	api.when = when
	api.subreddit = subreddit
	api.db = db
	api.pkg = pkg
	api.sha = sha
	api.nodeBinary = nodeBinary

	// externally provided methods
	api.auth = function() {
		return reddit.auth().catch(onError)
	}

	api.setTable = function() {
		return when.promise(function(resolve, reject) {
			db.run('CREATE TABLE IF NOT EXISTS posts ('
				+ 'id CHAR(15) UNIQUE NOT NULL, banned_by VARCHAR(32), domain VARCHAR(100) NOT NULL, '
				+ 'approved_by VARCHAR(32), author VARCHAR(32) NOT NULL, url VARCHAR(255) NOT NULL, '
				+ 'created_utc INTEGER NOT NULL, permalink VARCHAR(255) NOT NULL, _removed INTEGER NOT NULL,'
				+ '_last_touched INTEGER NOT NULL)', function(err) {
				if(err) {
					return reject(err)
				}
				resolve(true)
			})
		}).then(when.promise(function(resolve, reject) {
			db.run('CREATE TABLE IF NOT EXISTS userscans ('
				+ 'username VARCHAR(32) UNIQUE NOT NULL, last_scanned INTEGER NOT NULL)', function(err) {
				if(err) {
					return reject(err)
				}
				resolve(true)
			})
		})).then(when.promise(function(resolve, reject) {
			db.run('CREATE TABLE IF NOT EXISTS domainscans ('
				+ 'domain VARCHAR(100) UNIQUE NOT NULL, last_scanned INTEGER NOT NULL)', function(err) {
				if(err) {
					return reject(err)
				}
				resolve(true)
			})
		}))
	}

	// PAPERS PLS
	api.papers = function() {
		return reddit('/api/v1/me').get()
	}

	api.queryListing = function(uri, params, _depth) {
		return iterative(_depth || depth, uri, params)
	}

	api.queryDomain = function(domain) {
		// /domain/:domain is undocumented and therefore unsupported by reddit-api-generator
		// ...and therefore unsupported by snoocore, meaning we have to be a hacky asshole for this shit to work.
		// a damn shame, since this makes the iterative function even MORE of an ugly mess, but oh well.
		// once this endpoint is properly documented (and oauth-supported) we'll be able to get rid of raw mode in iterative()
		//
		// reference github issue: reddit/reddit#1147
		//
		return iterative(depth, 'https://www.reddit.com/domain/$domain/new.json', { $domain: domain }, true).then(function() {
			var sql = 'INSERT OR IGNORE INTO domainscans (domain, last_scanned) VALUES ($domain, $last_scanned)'

			var params = { $domain: domain, $last_scanned: Date.now() }
			db.run(sql, params, function(err) {
				if(err) {
					return onError(err)
				}

				if(!this.lastID) {
					sql = 'UPDATE domainscans SET last_scanned = $last_scanned WHERE domain = $domain'
					db.run(sql, params)
				}
			})
		})
	}

	api.queryUser = function(user) {
		// for some reason, this endpoint also requires raw mode. sigh.
		return iterative(depth, 'https://www.reddit.com/user/$username/submitted.json', { $username: user, sort: 'new' }).then(function() {
			var sql = 'INSERT OR IGNORE INTO userscans (username, last_scanned) VALUES ($username, $last_scanned)'

			var params = { $username: user, $last_scanned: Date.now() }
			db.run(sql, params, function(err) {
				if(err) {
					return onError(err)
				}

				if(!this.lastID) {
					sql = 'UPDATE userscans SET last_scanned = $last_scanned WHERE username = $username'
					db.run(sql, params)
				}
			})
		})
	}

	api.modmail = function(title, message) {
		return reddit("/api/compose").post({
			api_type: 'json',
			subject: title,
			text: message + "\n\n---\n\nThis message sent by TrainerRed " + pkg.version + sha + ' on ' + nodeBinary + ' ' + process.version + ' (' + process.arch + ')',
			to: '/r/' + subreddit
		})
	}

	// yes, I'm that lazy.
	api.removalRate = function(removed, total) {
		return (removed == 0) ? 0 : Math.round((removed / total) * 1000) / 10
	}

	//
	// here be dragons!
	// ...i'm serious.
	//
	// the following method is private, not to be publicly accessed because i said so
	//
	// also, a huge shout out to gh user trevorsenior for adding the listing feature to snoocore.
	// said feature made this function FAR simpler in the end and probably dropped the size of the code by half.
	//
	var iterative = function(depth, uri, params, raw) {
		var ret = [],
			queryOptions = {}

		if(!params.limit) {
			params.limit = maxFetch
		}

		// ugly hack around the domain/:domain/ thing mentioned above not being available.
		// this is the heart of the iterative "raw mode". maybe sometime soon we'll be able to remove it.
		var queryFn = function() {
			if(raw === true) {
				queryOptions = { bypassAuth: true }
				return reddit.raw(uri)
			}
			queryOptions = {}
			return reddit(uri)
		}

		// thank you based snoocore dev.
		return when.iterate(function(slice) {
				slice.children.map(iterativeExtractor).forEach(iterativeInserter)
				return slice.next()
			},
			function(slice) { return (slice.count >= depth || !!slice.empty ) },
			function(slice) { return },
			queryFn().listing(params, queryOptions)
		).catch(function(err) {
			// going to be passive about errors here, since there seems to be shenanigans with user pages
			// probably something to do with shadowbanned users, but idk.
			// reddit also occasionally has seizures that result in everything going down, but that's not something we can do much about.
			//
			// in the future, we might want to abort on any 50X errors, but we'll leave it alone for now and let the user panic and ^C instead
			console.error(err)
		})
	}

	// dragons here too. careful now.
	var iterativeExtractor = function(child) {
		// ignore self posts, they're irrelevant to us
		// further, ignore anything outside our own subreddit (such as in the case of user/domain queries)
		if(!child || child.data.is_self === true || child.data.subreddit !== subreddit) {
			return false
		}

		// build our sql param object now, while we have a moment
		return {
			$id: child.data.id,
			$banned_by: child.data.banned_by,
			$domain: child.data.domain,
			$approved_by: child.data.approved_by,
			$author: child.data.author,
			$url: child.data.url,
			$created_utc: child.data.created_utc,
			$permalink: 'https://reddit.com' + child.data.permalink,
			$_removed: !!child.data.banned_by ? 1 : 0
		}
	}

	// no confirmed dragon sightings here, but we did see a big lizard. don't get careless.
	var iterativeInserter = function(child) {
		if(!child || child === null) {
			return
		}

		child.$_last_touched = Date.now()
		// unfortunately, the above is going to be of a different format than created_utc.
		// we're using time in milliseconds; reddit is going by UNIX standard, which is seconds.
		// I -could- convert it over, but fuck it. I do what I want.

		var sql = 'INSERT OR IGNORE INTO posts (id, banned_by, domain, approved_by, author, url, created_utc, permalink, _removed, _last_touched)'
		sql += 'VALUES ($id, $banned_by, $domain, $approved_by, $author, $url, $created_utc, $permalink, $_removed, $_last_touched)'

		db.run(sql, child, function(err) {
			if(err) {
				return onError(err)
			}

			if(!this.lastID) {
				sql = 'UPDATE posts SET banned_by = $banned_by, approved_by = $approved_by, _removed = $_removed, _last_touched = $_last_touched'
				sql += ' WHERE id = $id AND _last_touched > $_last_touched'
				// no use trying to salvage the child object - just build a quick param object and go.
				db.run(sql, {
					$id: child.$id,
					$approved_by: child.$approved_by,
					$banned_by: child.$banned_by,
					$_removed: child.$_removed,
					$_last_touched: child.$_last_touched,
				})
			}
		})
	}

	return api
}

module.exports = TrainerRed
module.exports.when = when
