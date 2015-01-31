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
	var output = !!options.quiet ? function() {} || console.log,
		trainerred = require('./../lib')(options.config, options.db),
		db = trainerred.db,
		when = trainerred.when

	// sanity check options before takeoff
	if(!options.depth || (options.depth < 100 || options.depth > 1000)) {
		options.depth = 1000
	}

	trainerred.auth()
		.then(function() {
			trainerred.setTable()
			output('authenticated, querying...')
		})
		.then(function() {
			return trainerred.queryListing('/r/$subreddit/about/$location', {
				$location: 'spam',
				$subreddit: trainerred.subreddit,
				only: 'links',
				show: 'all'
			}, options.maxDepth)
		})
		.then(function() {
			return trainerred.queryListing('/r/$subreddit/new', {
				$subreddit: trainerred.subreddit,
				only: 'links',
				show: 'all'
			}, options.maxDepth)
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
			output('done')

			if(options.mail) {
				var msg = '## TrainerRed initial database population complete.'
				msg += '\n\nTrainerRed has obtained ' + total + ' entries for analysis.  Analysis data will be collected regularly, results will be soon to follow.'
				return trainerred.modmail('TrainerRed Database Populated', msg).then({
					output('initial modmail sent!')
				})
			}

			output('terminating...')
		.catch(trainerred.onError)
}
