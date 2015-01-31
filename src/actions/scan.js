'use strict'
//
// TrainerRed - subreddit submission analysis bot
// ---
// @copyright (c) 2014 Damian Bushong <katana@odios.us>
// @license MIT license
// @url <https://github.com/damianb/>
// @reddit <https://reddit.com/u/katana__>
// @twitter <https://twitter.com/blazingcrimson>
//

module.exports = function(options) {
	var output = !!options.quiet ? function() {} || console.log,
		trainerred = require('./../lib')(options.config, options.db),
		db = trainerred.db,
		when = trainerred.when,
		util = require('util')

	// sanity enforcement. options.days has to be (1 <= days <= 14)
	if(!options.days || (options.days < 1 || options.days > 14)) {
		options.days = 7
	}

	trainerred.auth()
		.then(function() {
			output('authenticated, querying...')
			if(!options.local) {
				return trainerred.queryListing('/r/$subreddit/about/$location', {
					$location: 'spam',
					$subreddit: trainerred.subreddit,
					only: 'links',
					show: 'all'
				}).then(function() {
					return trainerred.queryListing('/r/$subreddit/new', {
						$subreddit: trainerred.subreddit,
						only: 'links',
						show: 'all'
					})
				})
			}
		})
		.then(function() {
			// *ominous hand waving during $earliestTime conjuration*
			var params = { $earliestTime: (Math.round(Date.now() / 1000) - (1 * 60 * 60 * 24 * options.days)) }

			var userPromise = when.promise(function(resolve, reject) {
				db.all('SELECT author FROM posts WHERE _removed = 1 AND created_utc > $earliestTime'
					+ ' GROUP BY author ORDER BY COUNT(author) DESC LIMIT 10', params, function(err, rows) {
					if(err) {
						return reject(err)
					}

					resolve(rows)
				})
			})

			var domainPromise = when.promise(function(resolve, reject) {
				db.all('SELECT domain FROM posts WHERE _removed = 1 AND created_utc > $earliestTime'
					+ ' GROUP BY domain ORDER BY COUNT(domain) DESC LIMIT 10', params, function(err, rows) {
					if(err) {
						return reject(err)
					}

					resolve(rows)
				})
			})

			return when.join(
				// total posts submitted within the last week
				when.promise(function(resolve, reject) {
					db.get('SELECT COUNT(id) as count FROM posts WHERE created_utc > $earliestTime', params, function(err, row) {
						if(err) {
							return reject(err)
						}

						resolve(row.count)
					})
				}),
				// total posts REMOVED within the last week
				when.promise(function(resolve, reject) {
					db.get('SELECT COUNT(id) as count FROM posts WHERE _removed = 1 AND created_utc > $earliestTime', params, function(err, row) {
						if(err) {
							return reject(err)
						}

						resolve(row.count)
					})
				}),
				// users to review
				when.map(userPromise, function(rows) {
					var user = rows.author
					return trainerred.queryUser(user).then(function() {
						return when.join(
							when.promise(function(resolve, reject) {
								db.get('SELECT COUNT(id) as tCount FROM posts WHERE author = $user', { $user: user }, function(err, row) {
									if(err) {
										return reject(err)
									}

									resolve(row.tCount)
								})
							}),
							when.promise(function(resolve, reject) {
								db.get('SELECT COUNT(id) as rCount FROM posts WHERE author = $user AND _removed = 1', { $user: user }, function(err, row) {
									if(err) {
										return reject(err)
									}

									resolve(row.rCount)
								})
							}),
							when.promise(function(resolve, reject) {
								db.get('SELECT COUNT(id) as rec_tCount FROM posts WHERE author = $user'
									+ ' AND created_utc > $earliestTime', { $user: user, $earliestTime: params.$earliestTime }, function(err, row) {
									if(err) {
										return reject(err)
									}

									resolve(row.rec_tCount)
								})
							}),
							when.promise(function(resolve, reject) {
								db.get('SELECT COUNT(id) as rec_rCount FROM posts WHERE author = $user AND _removed = 1'
									+ ' AND created_utc > $earliestTime', { $user: user, $earliestTime: params.$earliestTime }, function(err, row) {
									if(err) {
										return reject(err)
									}

									resolve(row.rec_rCount)
								})
							})
						).then(function(val) {
							return {
								user: user,
								all: {
									total: val[0],
									removed: val[1]
								},
								recent: {
									total: val[2],
									removed: val[3]
								}
							}
						})
					})
				}),
				// domains to review
				// users to review
				when.map(domainPromise, function(rows) {
					var domain = rows.domain
					return trainerred.queryDomain(domain).then(function() {
						return when.join(
							when.promise(function(resolve, reject) {
								db.get('SELECT COUNT(id) as tCount FROM posts WHERE domain = $domain', { $domain: domain }, function(err, row) {
									if(err) {
										return reject(err)
									}

									resolve(row.tCount)
								})
							}),
							when.promise(function(resolve, reject) {
								db.get('SELECT COUNT(id) as rCount FROM posts WHERE domain = $domain AND _removed = 1', { $domain: domain }, function(err, row) {
									if(err) {
										return reject(err)
									}

									resolve(row.rCount)
								})
							}),
							when.promise(function(resolve, reject) {
								db.get('SELECT COUNT(id) as rec_tCount FROM posts WHERE domain = $domain'
									+ ' AND created_utc > $earliestTime', { $domain: domain, $earliestTime: params.$earliestTime }, function(err, row) {
									if(err) {
										return reject(err)
									}

									resolve(row.rec_tCount)
								})
							}),
							when.promise(function(resolve, reject) {
								db.get('SELECT COUNT(id) as rec_rCount FROM posts WHERE domain = $domain AND _removed = 1'
									+ ' AND created_utc > $earliestTime', { $domain: domain, $earliestTime: params.$earliestTime }, function(err, row) {
									if(err) {
										return reject(err)
									}

									resolve(row.rec_rCount)
								})
							})
						).then(function(val) {
							return {
								domain: domain,
								all: {
									total: val[0],
									removed: val[1]
								},
								recent: {
									total: val[2],
									removed: val[3]
								}
							}
						})
					})
				})
			)
		})
		.then(function(res) {
			// sigh, why does when.join have to be stupid...
			var total = res[0], removed = res[1], users = res[2], domains = res[3]
			output('done grabbing db entries, sending modmail')

			// note: this removal rate is only for recent submissions
			var removalRate = trainerred.removalRate(removed, total)
			if(options.mail) {
				var msg = '## TrainerRed initial database population complete.'
				msg += '\n\nTrainerRed has identified ' + total + ' entries (' + removed + ' removals; ' + trainerred.removalRate(removed, total) + '% removal rate) within the last 7 days for analysis.'
				msg += '\n\n---\n### users to review'
				msg += '\n\nsubmitter | overall subs | recent subs\n---|:---:|:---:'
				users.forEach(function(user) {
					if(user.all.removed === 1) {
						return // pass on this one, we don't need to care about first-struck users (we don't do the same for domains though)
					}
					msg += util.format('\n/u/%s | %d% (%d of %d rem) | %d% (%d of %d rem)',
						user.user, trainerred.removalRate(user.all.removed, user.all.total), user.all.removed, user.all.total,
						trainerred.removalRate(user.recent.removed, user.recent.total), user.recent.removed, user.recent.total)
				})
				msg += '\n\n---\n### domains to review'
				msg += '\n\ndomain | overall subs | recent subs\n---|:---:|:---:'
				domains.forEach(function(domain) {
					msg += util.format('\n[%s](https://www.reddit.com/domain/%s/) | %d% (%d of %d rem) | %d% (%d of %d rem)',
						domain.domain, domain.domain, trainerred.removalRate(domain.all.removed, domain.all.total), domain.all.removed, domain.all.total,
						trainerred.removalRate(domain.recent.removed, domain.recent.total), domain.recent.removed, domain.recent.total)
				})
				trainerred.modmail('TrainerRed Database updated', msg).then(function() {
					output('modmail sent!')
				})
			}

			// do we want to format the report and print it over stdout?
			// todo: other formatting options for stdout (csv?)
			// note: we're ignoring output() here and using console.log straight
			var stdoutExport = ''
			if(!options.export) {
				switch(options.export) {
					case 'json':
						stdoutExport = {
							overview: {
								total: total,
								removals: removed,
								removalRate: removalRate
							},
							users: [],
							domains: []
						}
						users.forEach(function(user) {
							if(user.all.removed === 1) {
								return
							}

							stdoutExport.users.push({
								user: '/u/' + user.user,
								recent: {
									total: user.recent.total,
									removed: user.recent.removed,
									rate: trainerred.removalRate(user.recent.removed, user.recent.total)
								}
								all: {
									total: user.all.total,
									removed: user.all.removed,
									rate: trainerred.removalRate(user.all.removed, user.all.total)
								}
							})
						})
						domains.forEach(function(domain) {
							stdoutExport.domains.push({
								domain: domain.domain,
								domainPage: 'https://www.reddit.com/domain/' + domain.domain,
								recent: {
									total: domain.recent.total,
									removed: domain.recent.removed,
									rate: trainerred.removalRate(domain.recent.removed, domain.recent.total)
								}
								all: {
									total: domain.all.total,
									removed: domain.all.removed,
									rate: trainerred.removalRate(domain.all.removed, domain.all.total)
								}
							})
						})
						stdoutExport = JSON.stringify(stdoutExport)
					break
					case 'standard':
					default:
						// todo - stdout formatting
					break
				}
				console.log(stdoutExport)
			}
			output('terminating...')
			return
		})
		.catch(trainerred.onError)
}
