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
	.option('--max-depth <depth>', 'maximum depth for API queries to reach (0 < depth <= 1000), default 1000')
	.action(function() {
		// todo
	})

cli.command('scan')
	.description('run TrainerRed in weekly scan mode, creating a report via moderator mail')
	.option('-d. --days <days>', 'number of days of material to use in the report, default 7')
	.option('--no-mail', 'do not send modmail report')
	.action(function() {
		// todo
	})

cli.command('domain <domain>')
	.description('run TrainerRed against a supplied domain')
	.action(function() {
		// todo
	})

cli.command('user <user>')
	.description('run TrainerRed against a supplied user')
	.action(function() {
		// todo
	})

cli.command('setup')
	.description('setup prompts for required config values, builds config file')
	.action(function() {
		// todo
	})

cli.parse(process.argv)
