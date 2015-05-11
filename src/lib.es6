//
// TrainerRed - subreddit submission analysis bot
// ---
// @copyright (c) 2014-2015 Damian Bushong <katana@odios.us>
// @license MIT license
// @url <https://github.com/damianb/>
// @reddit <https://reddit.com/u/katana__>
// @twitter <https://twitter.com/blazingcrimson>
//

import fs from 'fs'
import path from 'path'
import { execSync as pExec } from 'child_process'
import nconf as 'nconf'
import sqlite as _sqlite from 'sqlite3'
import snoocore, { when } from 'snoocore'

let pkg = require('./../package.json')
// todo see if we rerally do need verbose errors from sqlite3 now
let sqlite = _sqlite.verbose()

// general purpose var here for query depth, maximum fetch size (reddit only allows up to 100, mind)
const MAX_FETCH = 100

// getting information about the current "version" (if it's installed via git)
let sha = ''
let nodeBinary = path.basename(process.execPath)
if(fs.existsSync(path.normalize(__dirname + '/../.git'))) {
	try {
		sha = '(' + pExec('git rev-parse HEAD', { cwd: path.normalize(__dirname + '/../'), timeout: 500 }).slice(0,8) + ')'
	} catch(e) {}
}

function queryUserErrorHandler(err) {
	if(err.status && err.status === 404) {
		// pass, shadowbanned user
	} else {
		console.error(err)
	}
}

class TrainerRed {
	constructor(configFile, dbFile) {
		nconf
			.argv()
			.env()
			.file({ file: (configFile || './../config.json') })

		this.dbFile = dbFile
		this.subreddit = nconf.get('subreddit')
		this.exitOnError = nconf.get('fatalOnError')
		// null this for the time being, we'll lazy load it
		this.db = null

		this.reddit = new snoocore({
			userAgent: 'TrainerRed v' + pkg.version + ' - /r/' + subreddit,
			throttle: 5000, // bigger delay for our script, since we're querying harder than most things do
			oauth: {
				type: 'script',
				username: nconf.get('user:name'),
				password: nconf.get('user:password'),
				key: nconf.get('consumer:key'),
				secret: nconf.get('consumer:secret'),
				scope: [
					'identity',
					'read',
					'history',
					'modlog',
					'privatemessages'
				]
			}
		})
	}

	get db() {
		if(!this.db) {
			this.db = new sqlite.Database(dbFile || './../trainerred.db')
		}

		return this.db
	}

	onError(error, crit) {
		// some call this "error handling"
		// i call it "drop that shit like it's hot"
		console.error(error.stack || error)
		if (exitOnError === true || crit === true) {
			process.exit(1)
		}
	}

	// initial authentication
	auth() {
		return this.reddit().auth().catch(this.onError)
	}

	// prepare db tables
	setTable() {
		let self = this
		return when.promise(function(resolve, reject) {
			self.db.run('CREATE TABLE IF NOT EXISTS posts ('
				+ 'id CHAR(15) UNIQUE NOT NULL, banned_by VARCHAR(32), domain VARCHAR(100) NOT NULL, '
				+ 'approved_by VARCHAR(32), author VARCHAR(32) NOT NULL, url VARCHAR(255) NOT NULL, '
				+ 'created_utc INTEGER NOT NULL, permalink VARCHAR(255) NOT NULL, _removed INTEGER NOT NULL,'
				+ '_last_touched INTEGER NOT NULL)', (err) => if(err) { return reject(err) } else { resolve(true) }
		}).then(when.promise(function(resolve, reject) {
			self.db.run('CREATE TABLE IF NOT EXISTS userscans ('
				+ 'username VARCHAR(32) UNIQUE NOT NULL, last_scanned INTEGER NOT NULL)', (err) => if(err) { return reject(err) } else { resolve(true) } )
		})).then(when.promise(function(resolve, reject) {
			self.db.run('CREATE TABLE IF NOT EXISTS domainscans ('
				+ 'domain VARCHAR(100) UNIQUE NOT NULL, last_scanned INTEGER NOT NULL)', (err) => if(err) { return reject(err) } else { resolve(true) } )
		}))
	}

	// get our user info
	papers() {
		return this.reddit('/api/v1/me').get()
	}

	queryDomain(domain) {
		let self = this
		return this.queryListing('/domain/$domain/new', { $domain: domain },
		{ depth: 200 }).then( =>
			let params = { $domain: domain, $last_scanned: Date.now() }
			self.db.run('INSERT OR IGNORE INTO domainscans (domain, last_scanned) VALUES ($domain, $last_scanned)', params, function(err) {
				if(err) return onError(err)

				if(!this.lastID) {
					self.db.run('UPDATE domainscans SET last_scanned = $last_scanned WHERE domain = $domain', params)
				}
			})
		)
	}

	queryUser(user) {
		// we use queryUserErrorHandler here in order to ignore 404 users - also known as "the B&".
		let self = this
		return this.queryListing('/user/$username/submitted', { $username: user, sort: 'new' },
			{ depth: 200, errorHandler: queryUserErrorHandler }).then(function() {
			let params = { $username: user, $last_scanned: Date.now() }
			self.db.run('INSERT OR IGNORE INTO userscans (username, last_scanned) VALUES ($username, $last_scanned)', params, function(err) {
				if(err) return onError(err)

				if(!this.lastID) {
					self.db.run('UPDATE userscans SET last_scanned = $last_scanned WHERE username = $username', params)
				}
			})
		})
	}

	modmail(title, message) {
		let self = this
		return this.reddit("/api/compose").post({
			api_type: 'json',
			subject: title,
			text: message + "\n\n---\n\nThis message sent by TrainerRed " + pkg.version + sha + ' on ' + nodeBinary + ' ' + process.version,
			to: '/r/' + self.subreddit
		})
	}
	
	// yes, I'm that lazy.
	get removalRate(removed, total) {
		return (removed == 0) ? 0 : Math.round((removed / total) * 1000) / 10
	}
	
	//
	// here be dragons!
	// ...i'm serious.
	//
	// also, huge shout out to gh user trevorsenior for adding the listing feature to snoocore.
	// said feature made this function FAR simpler in the end and probably dropped the size of the code by half.
	//
	// options param properties:
	//  depth: how far to go in the iterative query?
	//  queryOptions: options object to pass to snoocore for the query (such as overrides)
	//  errorHandler: API query errorHandler override, useful for when we're dealing with users (and shadowbanned users 404'ing)
	//
	queryListing(uri, params, options) {
		let self = this,
			ret = [],
			options = options || {},
			queryOptions = options.queryOptions || {},
			depth = options.depth || 200,
			errorHandler = options.errorHandler || console.error

		if(!params.limit) {
			params.limit = maxFetch
		}

		// thank you based snoocore dev.
		return when.iterate(function(slice) {
				slice.children.map(self.iterativeExtractor).forEach(self.iterativeInserter)
				return slice.next()
			},
			function(slice) { return (slice.count >= depth || !!slice.empty ) },
			function(slice) { return },
			self.reddit(uri).listing(params, queryOptions)
		).catch(errorHandler)
	}
	
	// dragons here too. careful now.
	iterativeExtractor(child) {
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
	iterativeInserter(child) {
		let self = this
		if(!child || child === null) {
			return
		}

		child.$_last_touched = Date.now()
		// unfortunately, the above is going to be of a different format than created_utc.
		// we're using time in milliseconds; reddit is going by UNIX standard, which is seconds.
		// I -could- convert it over, but fuck it. I do what I want.

		let sql = 'INSERT OR IGNORE INTO posts (id, banned_by, domain, approved_by, author, url, created_utc, permalink, _removed, _last_touched)'
		sql += 'VALUES ($id, $banned_by, $domain, $approved_by, $author, $url, $created_utc, $permalink, $_removed, $_last_touched)'

		self.db.run(sql, child, function(err) {
			if(err) return onError(err)

			if(!this.lastID) {
				sql = 'UPDATE posts SET banned_by = $banned_by, approved_by = $approved_by, _removed = $_removed, _last_touched = $_last_touched'
				sql += ' WHERE id = $id AND _last_touched > $_last_touched'
				// no use trying to salvage the child object - just build a quick param object and go.
				self.db.run(sql, {
					$id: child.$id,
					$approved_by: child.$approved_by,
					$banned_by: child.$banned_by,
					$_removed: child.$_removed,
					$_last_touched: child.$_last_touched,
				})
			}
		})
	}
}

// define our exports
export default TrainerRed
export var sha
export var pkg
export var nodeBinary
export { when } from 'snoocore'