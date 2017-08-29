'use strict';

const async = require('async');
const fs = require('fs');
const _ = require('lodash');
const jsforce = require('jsforce');
const tools = require('jsforce-metadata-tools');
const rest = require('restler');
const temp = require('temp').track();
const path = require('path');
const glob = require('glob');
const chalk = require('chalk');

let conn;
let conf;

/** A map of class Ids to class information */
const classMap = {};

/** A map of test class Ids to class information */
const testClassMap = {};

const COVERALLS_ENDPOINT = 'https://coveralls.io/api/v1/jobs';
/**
* Log into the salsforce instance
*/
const sfdcLogin = done => {
  console.log(`Logging in as ${conf.username}`);
  conn.login(conf.username, conf.password + conf.securityToken, (err, res) => {
    if (!err) {
      console.log('Logged in');
    }
    done(err, res);
  });
};

const deploy = done => {
  const srcDir = `${process.cwd()}/src`;
  console.log(`Deploying package at ${srcDir}...`);
  conf.password = conf.password + conf.securityToken;
  tools
    .deployFromDirectory(srcDir, conf)
    .then(res => {
      tools.reportDeployResult(res, console, false);
      if (!res.success) {
        done(res.status);
      } else {
        done(null, res);
      }
    })
    .catch(err => {
      console.error(err);
      done(err);
    });
};
/**
* Builds a map of class id to class data
*/
const buildClassIdToClassDataMap = done => {
  console.log('Fetching class information');
  const pathTemplate = row => `src/classes/${row.Name}.cls`;

  conn
    .sobject('ApexClass')
    .find()
    .execute((err, data) => {
      if (err) {
        return done(err);
      }
      const projectClassNames = glob
        .sync(`${process.cwd()}/src/classes/*.cls`)
        .map(file => path.basename(file, '.cls'));

      // filter org classes by classes in the current project
      data = data.filter(row => _.includes(projectClassNames, row.Name));
      data.forEach(row => {
        if (!row.Body.match(/(@isTest|testMethod)/i)) {
          classMap[row.Id] = {
            name: pathTemplate(row),
            source: row.Body,
            coverage: [],
          };
        } else {
          testClassMap[row.Id] = {
            name: pathTemplate(row),
            source: row.Body,
          };
        }
      });
      const totalClasses = _.size(classMap) + _.size(testClassMap);
      console.log(`Got information about ${totalClasses} classes`);
      done();
    });
};

/**
* Runs all tests with the tooling api
*/
const runAllTests = done => {
  const classIds = _.keys(testClassMap);
  conn.tooling.runTestsAsynchronous(classIds, done);
};

const testMethodOutcomes = {
  Pass: chalk.green('✓'),
  Fail: chalk.red('✗'),
  Skip: chalk.gray('⤼'),
};

/**
* Query the test results
*
* @param testRunId The id of the test run
* @param deferred The Q.defer instance
*/
const queryTestResults = (testRunId, done) => {
  console.log('Waiting for tests');

  conn
    .sobject('ApexTestQueueItem')
    .find({
      ParentJobId: { $eq: testRunId },
    })
    .execute((err, queueItems) => {
      if (err) {
        return done(err);
      }
      if (
        _.some(
          queueItems,
          row => row.Status === 'Queued' || row.Status === 'Processing'
        )
      ) {
        return setTimeout(() => queryTestResults(testRunId, done), 5000);
      }
      queueItems = _.keyBy(queueItems, item =>
        path.basename(testClassMap[item.ApexClassId].name, '.cls')
      );

      conn
        .sobject('ApexTestResult')
        .find({
          AsyncApexJobId: { $eq: testRunId },
        })
        .execute((err, testResults) => {
          if (err) {
            return done(err);
          }
          const resultsByTestClass = _.chain(testResults)
            .groupBy('ApexClassId')
            .mapKeys((v, k) => path.basename(testClassMap[k].name, '.cls'))
            .mapValues(arr => _.sortBy(arr, 'MethodName'))
            .value();

          const statuses = {};
          _.forEach(resultsByTestClass, (rows, className) => {
            console.log(
              `\n\t${className} ${queueItems[className].ExtendedStatus}`
            );
            rows.forEach(row => {
              if (row.Outcome === 'CompileFail') {
                row.Outcome = 'Fail';
              }
              if (statuses[row.Outcome] == null) {
                statuses[row.Outcome] = 0;
              }
              statuses[row.Outcome]++;

              const icon = testMethodOutcomes[row.Outcome];
              console.log(`\t\t${icon} ${chalk.gray(row.MethodName)}`);
              if (row.Message) {
                console.log(
                  row.Message
                    .split('\n')
                    .map(ln => `\t\t\t${ln}`)
                    .join('\n')
                );
              }
              if (row.StackTrace) {
                console.log(
                  row.StackTrace
                    .split('\n')
                    .map(ln => `\t\t\t${ln}`)
                    .join('\n')
                );
              }
            });
          });
          console.log();
          if (statuses.Fail) {
            err = chalk.red(`There were ${statuses.Fail} failing tests`);
          } else {
            console.log(chalk.green(`All ${statuses.Pass} tests passed!`));
          }
          done(err, testResults);
        });
    });
};

/**
* Gets the test data and builds an array of the number of times the line was tested
*/
const buildCoverallsCoverage = done => {
  console.log('Fetching code coverage information');

  conn.tooling
    .sobject('ApexCodeCoverage')
    .find()
    .execute((err, data) => {
      if (err) {
        return done(err);
      }
      data.forEach(row => {
        const classId = row.ApexClassOrTriggerId;

        if (_.has(classMap, classId)) {
          const cov = classMap[classId].coverage;
          const maxLine = _.max(
            _.union(row.Coverage.coveredLines, row.Coverage.uncoveredLines)
          );
          const coverageSize = _.size(cov);

          if (maxLine > coverageSize) {
            for (let i = coverageSize; i <= maxLine; i += 1) {
              cov.push(null);
            }
          }
          row.Coverage.coveredLines.forEach(lnum => {
            if (cov[lnum - 1] === null) {
              cov[lnum - 1] = 1;
            } else {
              cov[lnum - 1] += 1;
            }
          });
          row.Coverage.uncoveredLines.forEach(lnum => {
            if (cov[lnum - 1] === null) {
              cov[lnum - 1] = 0;
            }
          });
        }
      });
      done();
    });
};

/**
* Posts the data to coveralls
*/
const postToCoveralls = done => {
  const coverallsData = {
    repo_token: conf.coverallsRepoToken,
    service_name: 'travis-ci',
    service_job_id: conf.travisJobId,
    source_files: _.values(classMap),
  };
  console.log('Posting data to coveralls');

  temp.mkdir('coveralls', (err, dirPath) => {
    const jsonPath = path.join(dirPath, 'coverallsData.json');
    fs.writeFile(jsonPath, JSON.stringify(coverallsData), err => {
      if (err) {
        return done(err);
      }
      rest
        .post(COVERALLS_ENDPOINT, {
          multipart: true,
          data: {
            json_file: rest.file(
              jsonPath,
              null,
              fs.statSync(jsonPath).size,
              null,
              'application/json'
            ),
          },
        })
        .on('complete', data => {
          if (data.error) {
            console.error('There was an error posting coverage.');
            return done(data.message);
          }
          console.log('Coverage posted.');
          done();
        });
    });
  });
};

module.exports.build = () => {
  conf = {
    loginUrl: process.env.SFDC_LOGINURL,
    username: process.env.SFDC_USERNAME,
    password: process.env.SFDC_PASSWORD,
    securityToken: process.env.SFDC_TOKEN,
    travisJobId: process.env.TRAVIS_JOB_ID,
    coverallsRepoToken: process.env.COVERALLS_REPO_TOKEN,
    pollTimeout: 5 * 60 * 1000,
    pollInterval: 5000,
    rollbackOnError: true,
    allowMissingFiles: false,
    autoUpdatePackage: false,
    ignoreWarnings: false,
  };
  conn = new jsforce.Connection({ loginUrl: conf.loginUrl });
  async.series(
    [
      sfdcLogin,
      deploy,
      buildClassIdToClassDataMap,
      done => runAllTests((err, res) => queryTestResults(res, done)),
      buildCoverallsCoverage,
      postToCoveralls,
    ],
    err => {
      if (err) {
        console.error(err);
        process.exit(1);
      }
    }
  );
};
