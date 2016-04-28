# sfdc-travisci-coveralls

[![npm version](https://img.shields.io/npm/v/sfdc-travisci-coveralls.svg)](https://www.npmjs.com/package/sfdc-travisci-coveralls)
[![Project Status: WIP - Initial development is in progress, but there has not yet been a stable, usable release suitable for the public.](http://www.repostatus.org/badges/latest/wip.svg)](http://www.repostatus.org/#wip)

Runs a project's Apex tests in TravisCI then reports overall coverage results to Coveralls.

You must enable access to your project's repo from within TravisCI and Coveralls for
it to be built. When commits are pushed, it will automatically be built.

## Prerequisites

* Node.js
* Git
* Account at [TravisCI](https://travis-ci.org)
* Account at [Coveralls](https://coveralls.io)


## Setup

### File structure

File structure is standard; `src` folder in root directory and a valid `package.xml`
file under it referencing the metadata in the package.

### Node

If `package.json` does not exist, run `npm init` in your project's directory. When prompted
for a test command, enter `sfdc-travisci-coveralls`.

Once initialized, install:
```bash
npm i -D sfdc-travisci-coveralls
```

Example `package.json`
```json
{
  "name": "my-project",
  "version": "1.0.0",
  "private": true,
  "license": "MIT",
  "repository": "jsmith/my-project",
  "scripts": {
    "test": "sfdc-travisci-coveralls"
  },
  "description": "My Salesforce Project",
  "devDependencies": {
    "sfdc-travisci-coveralls": "^0.1.0"
  }
}
```

You may also want to put `node_modules` in your `.gitignore` file.

### TravisCI

In the project's TravisCI configuration, you'll need to add some environment variables:

* `SFDC_LOGINURL`
* `SFDC_USERNAME`
* `SFDC_PASSWORD`
* `SFDC_SFDC_TOKEN`
* `COVERALLS_REPO_TOKEN` (found on the project's Coveralls page)

Create a `.travis.yml` file in the root of your project. Example:

`.travis.yml` ([docs](https://docs.travis-ci.com/user/languages/javascript-with-nodejs))

```yaml
language: node_js
node_js: "node"
git: depth: 1
```

### Commit/push

Commit the new files.

When pushed, TravisCI should immediately start running tests, which will post coverage to Coveralls!
