# sfdc-travisci-coveralls

[![npm version](https://img.shields.io/npm/v/sfdc-travisci-coveralls.svg)](https://www.npmjs.com/package/sfdc-travisci-coveralls)
[![Project Status: WIP - Initial development is in progress, but there has not yet been a stable, usable release suitable for the public.](http://www.repostatus.org/badges/latest/wip.svg)](http://www.repostatus.org/#wip)

Runs a project's Apex tests in TravisCI then reports overall coverage results to Coveralls.

You must enable access to your project's repo from within TravisCI and Coveralls for
it to be built. When commits are pushed, it will automatically be built.

## Prerequisites

* Node.js
* Git
* Account at [TravisCI](https://travis-ci.org/)
* Account at [Coveralls](https://coveralls.io/)


## Setup

Run `npm init` in your project's directory if `package.json` does not exist, then:

```bash
npm i -S sfdc-travisci-coveralls
```

In the project's TravisCI configuration, you'll need to add some environment variables to pass to `runTests()`:

* `SFDC_LOGINURL`
* `SFDC_USERNAME`
* `SFDC_PASSWORD`
* `SFDC_SFDC_TOKEN`
* `COVERALLS_REPO_TOKEN` (found on the project's Coveralls page)

Create `build.js` and `.travis.yml` files in the root of your project. Edit your `package.json` and update the "test"
script to run `node build`. Commit.

When pushed, TravisCI should immediately start running tests, which will post coverage to Coveralls!

## Example

`package.json`
```json
{
  "name": "my-project",
  "version": "1.0.0",
  "private": true,
  "license": "MIT",
  "repository": "jsmith/my-project",
  "scripts": {
    "test": "node build"
  },
  "description": "My Salesforce project",
  "dependencies": {
    "sfdc-travisci-coveralls": "^0.0.3"
  }
}
```

`build.js`

```javascript
var runTests = require('sfdc-travisci-coveralls');

runTests({
	loginUrl: process.env.SFDC_LOGINURL,
	username: process.env.SFDC_USERNAME,
	password: process.env.SFDC_PASSWORD,
	securityToken: process.env.SFDC_TOKEN,
	travisJobId: process.env.TRAVIS_JOB_ID,
	coverallsRepoToken: process.env.COVERALLS_REPO_TOKEN
}, function (err) {
	console.error(err);
}, function (data) {
	console.log('done.');
});

```

`.travis.yml` ([docs](https://docs.travis-ci.com/user/languages/javascript-with-nodejs))

```yaml
language: node_js
node_js: "node"
sudo: false
branches:
    only:
        - master
```
