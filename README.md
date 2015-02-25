## TrainerRed

### [/r/netsec](https://reddit.com/r/netsec) submission analysis

TrainerRed ([/u/_TrainerRed](https://reddit.com/u/_TrainerRed)) is the heart of a new submission analysis system for [/r/netsec](https://reddit.com/r/netsec),
designed to enable better, more consistent moderation for submissions.

TrainerRed is built for node.js 0.11+ (also compatible with io.js), and developed on top of the excellent [snoocore](https://github.com/trevorsenior/snoocore) library for the...not-so-well documented reddit API.
Information retrieved from the reddit API is analyzed locally, with results sent via modmail to the subreddit moderators.  Relevant data is stored locally to reduce load on reddit's servers during the analysis and to keep it from becoming entirely useless when reddit goes down anyways.

#### license

MIT license; see ./LICENSE for full text.

#### documentation

> It is pitch black. You are likely to be eaten by a grue.

Documentation will likely come upon the completion of 1.0.0.

#### future features?

Intended future features include

- correlating users and domains to assist in identification of astroturfing
- command line interface (via commander.js) to query users on demand

#### features that will never be

- automated bans
- automated subreddit shadowbans
- automated removals
- automated approvals

...basically, this set of scripts is intended to be read-only for all subreddit interaction.
The only direct write interaction it will have with the subreddit is in sending moderator mails.
