#!/usr/bin/env node
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
	when = trainerred.when,
	cli = require('commander'),
	pkg = require('./package.json')

cli.version(pkg.version)


cli.command('populate')
	.description('populate the database with a large set of API queries')

cli.command('scan')
	.description('run TrainerRed in weekly scan mode, creating a report via moderator mail')

// make this a --no-mail flag for the above instead?
cli.command('silentscan')
	.description('run TrainerRed in weekly scan mode, without creating a report')

cli.command('domain')
	.description('run TrainerRed against ')

cli.command('user')
	.description('')

cli.parse(process.argv)
