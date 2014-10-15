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

var populateDepth = 1000

trainerred.auth()
	.then(function() {
		trainerred.setTable()
	})
	.then(function() {
		console.log('authenticated, querying...')
	})
	.then(function() {
		return trainerred.queryListing('/r/$subreddit/about/$location', {
			$location: 'spam',
			$subreddit: trainerred.subreddit,
			only: 'links',
			show: 'all'
		}, populateDepth)
	})
	.then(function() {
		return trainerred.queryListing('/r/$subreddit/new', {
			$subreddit: trainerred.subreddit,
			only: 'links',
			show: 'all'
		}, populateDepth)
	})
	.then(function() {
		return when.promise(function(resolve, reject) {
			db.get('SELECT COUNT(id) as count FROM posts', function(err, row) {
				if(err) {
					return reject(err)
				}

				resolve(row.count)
			})
		})
	})
	.then(function(total) {
		console.log('done')

		var msg = '## TrainerRed initial database population complete.'
		msg += '\n\nTrainerRed has obtained ' + total + ' entries for analysis.  Analysis data will be collected regularly, results will be soon to follow.'
		return trainerred.modmail('TrainerRed Database Populated', msg)
	})
	.then(function() {
		console.log('initial modmail sent!')
	})
	.catch(trainerred.onError)
