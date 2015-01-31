#!/usr/bin/env node
//
// TrainerRed - subreddit submission analysis bot
// ---
// @copyright (c) 2014-2015 Damian Bushong <katana@odios.us>
// @license MIT license
// @url <https://github.com/damianb/>
// @reddit <https://reddit.com/u/katana__>
// @twitter <https://twitter.com/blazingcrimson>
//

var	lib = require(__dirname + '/src/lib'),
	db = trainerred.db,
	when = trainerred.when,
	cli = require('commander'),
	pkg = require(__dirname + '/package.json')

cli.version(pkg.version)

cli.command('populate')
	.description('populate the database with a large set of API queries')
	.option('--depth <depth>', 'maximum depth for API queries to reach (0 < depth <= 1000), default 1000')
	.option('--no-mail', 'do not send modmail report')
	.option('--config <config>', 'the configuration file to use (defaults to "config.json")')
	.option('--db <db>', 'the database file to use (defaults to "trainerred.db")')
	.option('--local', 'do not query the reddit api for additional information, just rely on the local database')
	.option('-q, --quiet', 'silence informational console messages')
	.action(function() {
		var action = require('./actions/populate')(cli) // hope this works... x.x;
	})

cli.command('scan')
	.description('run TrainerRed in periodic scan mode, creating a report via moderator mail')
	.option('-d. --days <days>', 'number of days of material to use in the report, default 7')
	.option('--no-mail', 'do not send modmail report')
	.option('--export [format]', 'output a specific format for the stdout version of the report (valid: "standard", "json"; default "standard")')
	.option('--config <config>', 'the configuration file to use (defaults to "config.json")')
	.option('--db <db>', 'the database file to use (defaults to "trainerred.db")')
	.option('--local', 'do not query the reddit api for additional information, just rely on the local database')
	.option('-q, --quiet', 'silence informational console messages')
	.action(function() {
		var action = require('./actions/scan')(cli)
	})

cli.command('domain <domain>')
	.description('run TrainerRed against a supplied domain')
	.option('--export [format]', 'output a specific format for the stdout version of the report (valid: "standard", "json"; default "standard")')
	.option('--config <config>', 'the configuration file to use (defaults to "config.json")')
	.option('--db <db>', 'the database file to use (defaults to "trainerred.db")')
	.option('--local', 'do not query the reddit api for additional information, just rely on the local database')
	.option('-q, --quiet', 'silence informational console messages')
	.action(function() {
		// todo
	})

cli.command('user <user>')
	.description('run TrainerRed against a supplied user')
	.option('--export [format]', 'output a specific format for the stdout version of the report (valid: "standard", "json"; default "standard")')
	.option('--config <config>', 'the configuration file to use (defaults to "config.json")')
	.option('--db <db>', 'the database file to use (defaults to "trainerred.db")')
	.option('--local', 'do not query the reddit api for additional information, just rely on the local database')
	.option('-q, --quiet', 'silence informational console messages')
	.action(function() {
		// todo
	})

cli.command('overview')
	.description('get an overview of the information collected by TrainerRed so far')
	.option('--export [format]', 'output a specific format for the stdout version of the report (valid: "standard", "json"; default "standard")')
	.option('--config <config>', 'the configuration file to use (defaults to "config.json")')
	.option('--db <db>', 'the database file to use (defaults to "trainerred.db")')
	.action(function() {
		// todo
	})

cli.command('setup')
	.description('setup prompts for required config values, builds config file')
	.option('--config <config>', 'the configuration file to use (defaults to "config.json")')
	.option('--db <db>', 'the database file to use (defaults to "trainerred.db")')
	.option('--local', 'do not query the reddit api for additional information, just rely on the local database')
	.option('-q, --quiet', 'silence informational console messages')
	.action(function() {
		// todo
	})

cli.parse(process.argv)
