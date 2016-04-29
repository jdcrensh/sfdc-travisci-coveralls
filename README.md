# sfdc-travisci-coveralls

[![npm version](https://img.shields.io/npm/v/sfdc-travisci-coveralls.svg)](https://www.npmjs.com/package/sfdc-travisci-coveralls)
[![Project Status: Active - The project has reached a stable, usable state and is being actively developed.](http://www.repostatus.org/badges/latest/active.svg)](http://www.repostatus.org/#active)

Runs a project's Apex tests in [TravisCI](https://travis-ci.org) then reports overall coverage
results to [Coveralls](https://coveralls.io).

Access to your project's repo will need to be enabled from Travis and Coveralls. When commits are
pushed, the build will run automatically.

Note that these services only support projects hosted on Github. Private repos will
require paid accounts at both.


## Prerequisites

* Account at [TravisCI](https://travis-ci.org)
* Account at [Coveralls](https://coveralls.io)


## Setup

A working project that may be used as a template:
[sample-apex-library](https://github.com/redteal/sample-apex-library).


### File structure

Expected file structure is standard; `src` folder in root directory and a valid `package.xml`
file under it referencing the package's metadata.

A `.travis.yml` file will also be needed.


### TravisCI

Create a ([`.travis.yml`](https://docs.travis-ci.com/user/languages/javascript-with-nodejs)) file at the root of
your project. Here's an example from [sample-apex-library](https://github.com/redteal/sample-apex-library):

```yaml
language: node_js
node_js:
  - node
git:
  depth: 1
install:
  - npm install -g sfdc-travisci-coveralls
script:
  - sfdc-travisci-coveralls
```

The build will also need an org to be run against. A solid option for this is to sign up a free
[developer](https://developer.salesforce.com/signup) org, a separate one for each project.

In the [Travis](https://travis-ci.org) configuration for the project, you'll
need to add some environment variables:

* `SFDC_LOGINURL` - eg. https://login.salesforce.com
* `SFDC_USERNAME` - username
* `SFDC_PASSWORD` - password
* `SFDC_TOKEN` - security token
* `COVERALLS_REPO_TOKEN` - found on the project's [Coveralls](https://coveralls.io) page


### Commit/push

Commit the `.travis.yml` file and push.

Travis will immediately start running the build. If either the deployment or tests fail, the
build will exit with a failing status.

Steps taken:
  1. Deploys the package
  2. Runs tests found in the package on the org
  3. Retrieves and parses Apex coverage results
  4. Posts coverage to Coveralls.io
