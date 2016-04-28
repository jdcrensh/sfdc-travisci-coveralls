const async = require('async');
const fs = require('fs');
const _ = require('lodash');
const jsforce = require('jsforce');
const tools = require('jsforce-metadata-tools');
const rest = require('restler');
const temp = require('temp').track();
const path = require('path');
const glob = require('glob');

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
const sfdcLogin = (done) => {
  console.log('Logging in as ' + conf.username);
  conn.login(conf.username, conf.password + conf.securityToken, (err, res) => {
    if (!err) {
      console.log('Logged in');
    }
    done(err, res);
  });
};

const deploy = (done) => {
  const srcDir = process.cwd() + '/src';
  console.log(`Deploying package at ${srcDir}...`);
  conf.password = conf.password + conf.securityToken;
  tools.deployFromDirectory(srcDir, conf).then((res) => {
    tools.reportDeployResult(res, console, false);
    if (!res.success) {
      done(res.status);
    } else {
      done(null, res);
    }
  }).catch((err) => {
    console.error(err);
    done(err);
  });
};

/**
* Builds a map of class id to class data
*/
const buildClassIdToClassDataMap = (done) => {
  console.log('Fetching class information');
  var pathTemplate = row => `src/classes/${row.Name}.cls`;

  conn.sobject('ApexClass').find().execute((err, data) => {
    if (err) {
      return done(err);
    }
    const projectClassNames = glob.sync(process.cwd() + '/src/classes/*.cls').map(file => path.basename(file, '.cls'));

    // filter org classes by classes in the current project
    data = data.filter(row => _.includes(projectClassNames, row.Name));
    data.forEach((row) => {
      if (row.Body.indexOf('@isTest') === -1) {
        classMap[row.Id] = {
          name: pathTemplate(row),
          source: row.Body,
          coverage: []
        };
      } else {
        testClassMap[row.Id] = {
          name: pathTemplate(row),
          source: row.Body
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
const runAllTests = (done) => {
  const classIds = _.keys(testClassMap);
  conn.tooling.runTestsAsynchronous(classIds, done);
};

/**
* Query the test results
*
* @param testRunId The id of the test run
* @param deferred The Q.defer instance
*/
const queryTestResults = (testRunId, done) => {
  console.log('Waiting for tests');

  var queryStr = `SELECT Id,Status,ApexClassId,ExtendedStatus FROM ApexTestQueueItem ` +
                 `WHERE ParentJobId = '${testRunId}'`;
  conn.query(queryStr, (err, data) => {
    if (err) {
      return done(err);
    }
    if (!_.some(data.records, row => row.Status === 'Queued' || row.Status === 'Processing')) {
      data.records.forEach((row) => {
        console.log(`[${row.Status} ${row.ExtendedStatus}] ${testClassMap[row.ApexClassId].name}`);
      });
      if (_.some(data.records, row => row.Status === 'Failed')) {
        err = 'Failed';
      }
      return done(null, data);
    }
    setTimeout(() => queryTestResults(testRunId, done), 5000);
  });
};

/**
* Gets the test data and builds an array of the number of times the line was tested
*/
const buildCoverallsCoverage = (done) => {
  console.log('Fetching code coverage information');

  conn.tooling.sobject('ApexCodeCoverage').find().execute((err, data) => {
    if (err) {
      return done(err);
    }
    data.forEach((row) => {
      const classId = row.ApexClassOrTriggerId;

      if (_.has(classMap, classId)) {
        const cov = classMap[classId].coverage;
        let maxLine = _.max(_.union(row.Coverage.coveredLines, row.Coverage.uncoveredLines));
        let coverageSize = _.size(cov);

        if (maxLine > coverageSize) {
          for (let i = coverageSize; i <= maxLine; i += 1) {
            cov.push(null);
          }
        }
        row.Coverage.coveredLines.forEach((lnum) => {
          if (cov[lnum - 1] === null) {
            cov[lnum - 1] = 1;
          } else {
            cov[lnum - 1] += 1;
          }
        });
        row.Coverage.uncoveredLines.forEach((lnum) => {
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
const postToCoveralls = (done) => {
  const coverallsData = {
    repo_token: conf.coverallsRepoToken,
    service_name: 'travis-ci',
    service_job_id: conf.travisJobId,
    source_files: _.values(classMap)
  };
  console.log('Posting data to coveralls');

  temp.mkdir('coveralls', (err, dirPath) => {
    const jsonPath = path.join(dirPath, 'coverallsData.json');
    fs.writeFile(jsonPath, JSON.stringify(coverallsData), (err) => {
      if (err) {
        return done(err);
      }
      rest.post(COVERALLS_ENDPOINT, {
        multipart: true,
        data: {
          json_file: rest.file(jsonPath, null, fs.statSync(jsonPath).size, null, 'application/json')
        }
      }).on('complete', data => done());
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
    coverallsRepoToken: process.env.COVERALLS_REPO_TOKEN
  };
  conn = new jsforce.Connection({loginUrl: conf.loginUrl});
  async.series([
    sfdcLogin,
    deploy,
    buildClassIdToClassDataMap,
    done => runAllTests((err, res) => queryTestResults(res, done)),
    buildCoverallsCoverage,
    postToCoveralls
  ], (err) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
  });
};
