'use strict'
//
// TrainerRed - subreddit submission analysis bot
// ---
// @copyright (c) 2014 Damian Bushong <katana@odios.us>
// @license MIT license
// @url <https://github.com/damianb/>
// @reddit <https://reddit.com/u/katana__>
// @twitter <https://twitter.com/burningcrimson>
//

var	trainerred = require('./trainerred'),
	db = trainerred.db,
	when = trainerred.when

trainerred.auth()
	.then(function() {
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
				db.all('SELECT author, COUNT(author) FROM posts WHERE _removed = 1 AND created_utc > $earliestTime'
					+ ' GROUP BY author ORDER BY COUNT(author) DESC LIMIT 20', params, function(err, rows) {
					if(err) {
						return reject(err)
					}

					resolve(rows)
				})
			}),
			// domains to review
			when.promise(function(resolve, reject) {
				db.all('SELECT domain, COUNT(domain) FROM posts WHERE _removed = 1 AND created_utc > $earliestTime AND banned_by <> "AutoModerator"'
					+ 'GROUP BY domain ORDER BY COUNT(domain) DESC LIMIT 10', params, function(err, rows) {
					if(err) {
						return reject(err)
					}

					resolve(rows)
				})
			})
		)
	})
	.then(function(total, removed, users, domains) {
		console.log('done grabbing db entries, sending modmail')

		var msg = '## TrainerRed initial database population complete.'
		msg + '\n\nTrainerRed has identified ' + total + ' entries within the last 7 days for analysis.' // todo expand upon modmail message
		return trainerred.modmail('TrainerRed Database updated', msg)
	})
	.then(function() {
		console.log('modmail sent! terminating...')
	})
	.catch(trainerred.onError)
