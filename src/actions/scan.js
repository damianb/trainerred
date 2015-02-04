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

module.exports = function(options) {
	var trainerred = require('./../lib')(options.config, options.db),
		db = trainerred.db,
		when = trainerred.when,
		util = require('util'),
		output = null

	if(options.quiet) {
		output = function() {}
	} else {
		output = console.log
	}

	// internal functions
	var userReview = function(user) {
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
				+ ' AND created_utc > $earliestTime', { $user: user, $earliestTime: earliestTime }, function(err, row) {
					if(err) {
						return reject(err)
					}

					resolve(row.rec_tCount)
				})
			}),
			when.promise(function(resolve, reject) {
				db.get('SELECT COUNT(id) as rec_rCount FROM posts WHERE author = $user AND _removed = 1'
				+ ' AND created_utc > $earliestTime', { $user: user, $earliestTime: earliestTime }, function(err, row) {
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
					removed: val[1],
					rate: trainerred.removalRate(val[1], val[0])
				},
				recent: {
					total: val[2],
					removed: val[3],
					rate: trainerred.removalRate(val[3], val[2])
				}
			}
		})
	},
	domainReview = function(domain) {
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
				+ ' AND created_utc > $earliestTime', { $domain: domain, $earliestTime: earliestTime }, function(err, row) {
					if(err) {
						return reject(err)
					}

					resolve(row.rec_tCount)
				})
			}),
			when.promise(function(resolve, reject) {
				db.get('SELECT COUNT(id) as rec_rCount FROM posts WHERE domain = $domain AND _removed = 1'
				+ ' AND created_utc > $earliestTime', { $domain: domain, $earliestTime: earliestTime }, function(err, row) {
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
					removed: val[1],
					rate: trainerred.removalRate(val[1], val[0])
				},
				recent: {
					total: val[2],
					removed: val[3],
					rate: trainerred.removalRate(val[3], val[2])
				}
			}
		})
	}

	// sanity enforcement. options.days has to be (1 <= days <= 14)
	var dayWindow = options.days,
		earliestTime = null,
		startTime = new Date()
	if(!dayWindow || (dayWindow < 1 || dayWindow > 14)) {
		dayWindow = 7
	}
	earliestTime = (Math.round(Date.now() / 1000) - (1 * 60 * 60 * 24 * dayWindow))

	trainerred.auth()
		.then(function() {
			output('authenticated!')
			if(!options.local) {
				output('querying reddit...')

				return when.join(
					trainerred.queryListing('/r/$subreddit/about/$location', {
						$location: 'spam',
						$subreddit: trainerred.subreddit,
						only: 'links',
						show: 'all'
					}),
					trainerred.queryListing('/r/$subreddit/new', {
						$subreddit: trainerred.subreddit,
						only: 'links',
						show: 'all'
					})
				)
			} else {
				output('only scanning local records...')
				return
			}
		})
		.then(function() {
			// *ominous hand waving during $earliestTime conjuration*
			var params = { $earliestTime: earliestTime }

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
					if(!options.local) {
						return trainerred.queryUser(user).fold(userReview, user)
					} else {
						return userReview(user)
					}
				}),
				// domains to review
				when.map(domainPromise, function(rows) {
					var domain = rows.domain
					if(!options.local) {
						return trainerred.queryDomain(domain).fold(domainReview, domain)
					} else {
						return domainReview(domain)
					}
				})
			)
		})
		.then(function(res) {
			// sigh, why does when.join have to be stupid...
			var total = res[0], removed = res[1], users = res[2], domains = res[3],
				overallRemovalRate = trainerred.removalRate(removed, total),
				msg = ''

			output('done grabbing db entries, generating report')

			var report = {
				overview: {
					total: total,
					removed: removed,
					rate: overallRemovalRate
				},
				users: [],
				domains: []
			}
			users.forEach(function(user) {
				if(user.all.removed === 1) {
					return
				}

				report.users.push({
					user: '/u/' + user.user,
					recent: user.recent,
					all: user.all,
				})
			})
			domains.forEach(function(domain) {
				report.domains.push({
					domain: domain.domain,
					domainPage: 'https://www.reddit.com/domain/' + domain.domain,
					recent: domain.recent,
					all: domain.all
				})
			})

			if(options.mail) {
				msg = '## TrainerRed scan complete.'
				msg += '\n\nTrainerRed has identified ' + report.overview.total + ' entries (' + report.overview.removed + ' removals; '
				msg += report.overview.rate + '% removal rate) within the last ' + dayWindow + ' days for analysis.'

				msg += '\n\n---\n### users to review'
				msg += '\n\nsubmitter | overall subs | recent subs\n---|:---:|:---:'
				report.users.forEach(function(user) {
					if(user.all.removed === 1) {
						return // pass on this one, we don't need to care about first-struck users (we don't do the same for domains though)
					}
					msg += util.format('\n%s | %d% (%d of %d rem) | %d% (%d of %d rem)',
						user.user, user.all.rate, user.all.removed, user.all.total,
						user.recent.rate, user.recent.removed, user.recent.total)
				})

				msg += '\n\n---\n### domains to review'
				msg += '\n\ndomain | overall subs | recent subs\n---|:---:|:---:'
				report.domains.forEach(function(domain) {
					msg += util.format('\n[%s](%s/) | %d% (%d of %d rem) | %d% (%d of %d rem)',
						domain.domain, domain.domainPage, domain.all.rate, domain.all.removed, domain.all.total,
						domain.recent.rate, domain.recent.removed, domain.recent.total)
				})

				msg += '\n\n---\nScan started at ' + startTime + '\n\nScan completed at ' + new Date()

				trainerred.modmail('TrainerRed Database updated', msg).then(function() {
					output('modmail sent!')
				})
			}

			// do we want to format the report and print it over stdout?
			// todo: other formatting options for stdout (csv?)
			// note: we're ignoring output() here and using console.log straight
			if(!options.export) {
				switch(options.export) {
					case 'json':
						// well, that was easy
						console.log(JSON.stringify(report))
					break
					case 'standard':
					default:
						msg = '\nTrainerRed scan complete'
						msg += '\n\nTrainerRed has identified ' + report.overview.total + ' entries (' + report.overview.removed + ' removals; '
						msg += report.overview.rate + '% removal rate) within the last ' + dayWindow + ' days for analysis.'

						msg += '\n\n------------------------\nusers to review\n------------------------'
						msg += '\n\nsubmitter | overall subs | recent subs'
						report.users.forEach(function(user) {
							if(user.all.removed === 1) {
								return // pass on this one, we don't need to care about first-struck users (we don't do the same for domains though)
							}
							msg += util.format('\n%s | %d% (%d of %d rem) | %d% (%d of %d rem)',
							user.user, user.all.rate, user.all.removed, user.all.total,
							user.recent.rate, user.recent.removed, user.recent.total)
						})

						msg += '\n\n------------------------\ndomains to review\n------------------------'
						msg += '\n\ndomain | overall subs | recent subs'
						report.domains.forEach(function(domain) {
							msg += util.format('\n%s - %s/ | %d% (%d of %d rem) | %d% (%d of %d rem)',
							domain.domain, domain.domainPage, domain.all.rate, domain.all.removed, domain.all.total,
							domain.recent.rate, domain.recent.removed, domain.recent.total)
						})

						msg += '\n\n------------------------\nScan started at ' + startTime + '\n\nScan completed at ' + new Date()
						console.log(msg)
					break
				}
			}
			output('terminating...')
			return
		})
		.catch(trainerred.onError)
}
