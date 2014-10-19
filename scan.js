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

var	trainerred = require('./trainerred'),
	db = trainerred.db,
	when = trainerred.when

trainerred.auth()
	.then(function() {
		//console.log('running trainerred in this method is DEPRECATED; please reference the new documentation')
		console.log('authenticated, querying...')
	})
	.then(function() {
		return trainerred.queryListing('/r/$subreddit/about/$location', {
			$location: 'spam',
			$subreddit: trainerred.subreddit,
			only: 'links',
			show: 'all'
		})
	})
	.then(function() {
		return trainerred.queryListing('/r/$subreddit/new', {
			$subreddit: trainerred.subreddit,
			only: 'links',
			show: 'all'
		})
	})
	.then(function() {
		var params = { $earliestTime: (Math.round(Date.now() / 1000) - (1 * 60 * 60 * 24 * 7)) } // 7 days

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
			when.promise(function(resolve, reject) {
				db.all('SELECT author, COUNT(author) as rem_count FROM posts WHERE _removed = 1 AND created_utc > $earliestTime'
					+ ' GROUP BY author ORDER BY COUNT(author) DESC LIMIT 20', params, function(err, rows) {
					if(err) {
						return reject(err)
					}

					resolve(rows)
				})
			}),
			// domains to review
			when.promise(function(resolve, reject) {
				db.all('SELECT domain, COUNT(domain) as rem_count FROM posts WHERE _removed = 1 AND created_utc > $earliestTime AND banned_by <> "AutoModerator"'
					+ 'GROUP BY domain ORDER BY COUNT(domain) DESC LIMIT 10', params, function(err, rows) {
					if(err) {
						return reject(err)
					}

					resolve(rows)
				})
			})
		)
	})
	.then(function(res) {
		// sigh, why does when.join have to be stupid...
		var total = res[0], removed = res[1], users = res[2], domains = res[3]
		console.log('done grabbing db entries, sending modmail')

		var removalRate = (removed == 0) ? 0 : Math.round((removed / total) * 1000) / 10

		var msg = '## TrainerRed initial database population complete.'
		msg += '\n\nTrainerRed has identified ' + total + ' entries (' + removed + ' removals; ' + removalRate + '% removal rate) within the last 7 days for analysis.'
		msg += '\n\n---\n### users to review'
		msg += '\n\nsubmitter | rem count\n---|---'
		users.forEach(function(user) {
			msg += '\n/u/' + user.author + ' | ' + user.rem_count
		})
		msg += '\n\n---\n### domains to review'
		msg += '\n\nsubmitter | rem count\n---|---'
		domains.forEach(function(domain) {
			msg += '\n[' + domain.domain + '](https://reddit.com/domain/' + domain.domain + '/) | ' + domain.rem_count
		})
		return trainerred.modmail('TrainerRed Database updated', msg)
	})
	.then(function() {
		console.log('modmail sent! terminating...')
	})
	.catch(trainerred.onError)
