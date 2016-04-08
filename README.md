# sfdc-travisci-coveralls

[![npm version](https://img.shields.io/npm/v/sfdc-travisci-coveralls.svg?style=flat-square)](https://www.npmjs.com/package/sfdc-travisci-coveralls)

Runs a project's Apex tests in TravisCI then posts their coverage results to Coveralls.

## Install

```bash
npm i -S sfdc-travisci-coveralls
```

## Example

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
