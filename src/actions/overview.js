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
		output = function() {}

	if(!options.quiet) {
		output = console.log
	}

  // avoid auth, just start querying the local db.
  when.join(
    // total posts tracked
    when.promise(function(resolve, reject) {
      db.get('SELECT COUNT(id) AS count FROM posts', null, function(err, row) {
        if(err) {
          return reject(err)
        }

        resolve(row.count)
      })
    }),
    // total posts removed of those tracked
    when.promise(function(resolve, reject) {
      db.get('SELECT COUNT(id) AS count FROM posts WHERE _removed = 1', null, function(err, row) {
        if(err) {
          return reject(err)
        }

        resolve(row.count)
      })
    }),
    // top 10 submitters (will obtain their +/- rate later)
    when.promise(function(resolve, reject) {
      db.get('SELECT author FROM posts GROUP BY author ORDER BY COUNT(author) DESC LIMIT 10', null, function(err, rows) {
        if(err) {
          return reject(err)
        }

        resolve(rows)
      })
    }),
    // empty function for copypasta
    when.promise(function(resolve, reject) {
      db.get('', null, function(err, row) {
        if(err) {
          return reject(err)
        }

        resolve(row.count)
      })
    }),
  )
  .then(function(total) {
    // todo
    output('done')
  .catch(trainerred.onError)
}
