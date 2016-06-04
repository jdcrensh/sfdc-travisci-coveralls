# sfdc-travisci-coveralls

[![npm version](https://img.shields.io/npm/v/sfdc-travisci-coveralls.svg)][1]
[![npm](https://img.shields.io/npm/dm/sfdc-travisci-coveralls.svg)][1]

Runs a Salesforce project's Apex tests via [TravisCI][] and reports
overall coverage results to [Coveralls][].

Access to your project's repo will need to be enabled in both Travis and Coveralls.
When commits are pushed, the build will run automatically.

Note that these services only support projects hosted on Github. Private repos will
require paid accounts at both.


## Prerequisites

* Account at [TravisCI][]
* Account at [Coveralls][]


## Setup

A working project that may be used as a template: [sample-apex-library][].


### File structure

Expected file structure is standard; `src` folder in root directory and a
valid `package.xml` file under it referencing the package's metadata.

A `.travis.yml` file will also be needed.


### TravisCI

Create a [`.travis.yml`][2] file at the root of your project. Here's an
example from [sample-apex-library][]:

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

The build will also need an org to be run against. A solid option for this is to
sign up a free [developer][] org, a separate one for each project.

In the [TravisCI][] configuration for the project, you'll need to add some
environment variables:

* `SFDC_LOGINURL` - eg. https://login.salesforce.com
* `SFDC_USERNAME` - username
* `SFDC_PASSWORD` - password
* `SFDC_TOKEN` - security token
* `COVERALLS_REPO_TOKEN` - found on the project's [Coveralls][] page


### Commit/push

Commit the `.travis.yml` file and push.

Travis will immediately start running the build. If either the deployment or tests
fail, the build will exit with a failing status.

Steps taken:
  1. Deploys the package
  2. Runs tests found in the package on the org
  3. Retrieves and parses Apex coverage results
  4. Posts coverage to Coveralls.io

[1]: https://www.npmjs.com/package/sfdc-travisci-coveralls
[2]: https://docs.travis-ci.com/user/languages/javascript-with-nodejs
[TravisCI]: https://travis-ci.org
[Coveralls]: https://coveralls.io
[sample-apex-library]: https://github.com/redteal/sample-apex-library
[developer]: https://developer.salesforce.com/signup
