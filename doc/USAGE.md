## using TrainerRed

TrainerRed is mostly self-evident in use, with a few exceptions; however, it'll still be spelled out below for proper reference.

### contents

* installation
* configuration
* database population
* running a scan
* investigating a user
* investigating a domain

#### installation

Installation of TrainerRed requires setting up a new reddit OAuth application, which can be done so [here](https://www.reddit.com/prefs/apps/).  The suggested type is that of `script`, and you can just enter in `http://localhost/` for the about url and redirect url textboxes.  Record the OAuth key (when the OAuth application is created, it will appear below the application type) and the secret; you will need these shortly.

Next, clone the repository via git and checkout the latest tag (the tags available can be listed with `git tag`).  Install node 0.11+ through your favorite methodology along with any necessary packages for SQLite3 support, then run `npm install` to install all necessary dependencies through npm.

#### configuration
