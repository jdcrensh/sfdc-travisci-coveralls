var Q = require('q');
var fs = require('fs');
var _ = require('lodash');
var jsforce = require('jsforce');
var rest = require('restler');
var temp = require('temp').track();
var path = require('path');
var glob = require('glob');

var conf;
var conn;

/** A map of class Ids to class information */
var classMap = {};

/** A map of test class Ids to class information */
var testClassMap = {};

var COVERALLS_ENDPOINT = 'https://coveralls.io/api/v1/jobs';
/**
* Log into the salsforce instance
*/
var sfdcLogin = function () {
  var deferred = Q.defer();

  console.log('Logging in as ' + conf.username);

  conn.login(conf.username, conf.password + conf.securityToken, function (error, res) {
    if (error) {
      deferred.reject(new Error(error));
    } else {
      console.log('Logged in');
      deferred.resolve();
    }
  });
  return deferred.promise;
};

/**
* Builds a map of class id to class data
*/
var buildClassIdToClassDataMap = function () {
  console.log('Fetching class information');

  var deferred = Q.defer();
  var pathTemplate = _.template('src/classes/<%= Name %>.cls');

  conn.sobject('ApexClass').find().execute(function (err, data) {
    if (err) {
      deferred.reject(new Error(err));
    } else {
      var mainDir = path.dirname(require.main.filename);
      var projectClassNames = glob.sync(mainDir + '/src/classes/*.cls').map(function (file) {
        return path.basename(file, '.cls');
      });
      // filter org classes by classes in the current project
      data = _.filter(data, function (row) {
        return _.includes(projectClassNames, row.Name);
      });
      _.forEach(data, function (row) {
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
      var totalClasses = _.size(classMap) + _.size(testClassMap);
      console.log('Got information about ' + totalClasses + ' classes');
      deferred.resolve();
    }
  });
  return deferred.promise;
};

/**
* Runs all tests with the tooling api
*/
var runAllTests = function () {
  var classIds = _.keys(testClassMap);
  var deferred = Q.defer();

  conn.tooling.runTestsAsynchronous(classIds, function (error, data) {
    if (error) {
      deferred.reject(new Error(error));
    } else {
      deferred.resolve(data);
    }
  });
  return deferred.promise;
};

/**
* Query the test results
*
* @param testRunId The id of the test run
* @param deferred The Q.defer instance
*/
var queryTestResults = function myself(testRunId, deferred) {
  console.log('Waiting for tests');
  var queryStr = 'SELECT Id,Status,ApexClassId FROM ApexTestQueueItem WHERE ParentJobId = \'' + testRunId + '\'';
  conn.query(queryStr, function (error, data) {
    if (error) {
      deferred.reject(new Error(error));
    } else {
      var isComplete = !_.some(data.records, function (row) {
        return row.Status === 'Queued' || row.Status === 'Processing';
      });
      if (isComplete) {
        deferred.resolve();
      } else {
        setTimeout(function () {
          myself(testRunId, deferred);
        }, 5000);
      }
    }
  });
};

/**
* Waits until all tests are completed
*
* @param testRunId The id of the test run
*/
var waitUntilTestsComplete = function (testRunId) {
  var deferred = Q.defer();
  queryTestResults(testRunId, deferred);
  return deferred.promise;
};

/**
* Gets the test data and builds an array of the number of times the line was tested
*/
var buildCoverallsCoverage = function () {
  var deferred = Q.defer();
  console.log('Fetching code coverage information');

  conn.tooling.sobject('ApexCodeCoverage').find().execute(function (error, data) {
    if (error) {
      deferred.reject(new Error(error));
    } else {
      console.log('Got information about ' + _.size(data) + ' tests');

      data.forEach(function (row) {
        var classId = row.ApexClassOrTriggerId;

        if (_.has(classMap, classId)) {
          var max_line = _.max(_.union(row.Coverage.coveredLines, row.Coverage.uncoveredLines));
          var coverage_size = _.size(classMap[classId].coverage);

          if (max_line > coverage_size) {
            for (var i = coverage_size; i <= max_line; i += 1) {
              classMap[classId].coverage.push(null);
            }
          }

          _.forEach(row.Coverage.coveredLines, function (lineNumber) {
            if (classMap[classId].coverage[lineNumber - 1] === null) {
              classMap[classId].coverage[lineNumber - 1] = 1;
            } else {
              classMap[classId].coverage[lineNumber - 1] += 1;
            }
          });

          _.forEach(row.Coverage.uncoveredLines, function (lineNumber) {
            if (classMap[classId].coverage[lineNumber - 1] === null) {
              classMap[classId].coverage[lineNumber - 1] = 0;
            }
          });
        }
      });
      deferred.resolve();
    }
  });

  return deferred.promise;
};

/**
* Posts the data to coveralls
*/
var postToCoveralls = function () {
  var fs_stats;
  var post_options;
  var deferred = Q.defer();
  var coverallsData = {
    repo_token: conf.coverallsRepoToken,
    service_name: 'travis-ci',
    service_job_id: conf.travisJobId,
    source_files: _.values(classMap)
  };

  console.log('Posting data to coveralls');
  temp.mkdir('coveralls', function (err, dirPath) {
    var jsonPath = path.join(dirPath, 'coverallsData.json');
    fs.writeFile(jsonPath, JSON.stringify(coverallsData), function (fs_error) {
      if (fs_error) {
        deferred.reject(new Error(fs_error));
      } else {
        rest.post(COVERALLS_ENDPOINT, {
          multipart: true,
          data: {
            json_file: rest.file(jsonPath, null, fs.statSync(jsonPath).size, null, 'application/json')
          }
        }).on('complete', function (data) {
          deferred.resolve();
        });
      }
    });
  });
  return deferred.promise;
};

module.exports = function (_conf, onError, onComplete) {
  conf = _conf;
  conn = new jsforce.Connection({loginUrl: conf.loginUrl});

  Q.fcall(sfdcLogin)
  .then(buildClassIdToClassDataMap)
  .then(runAllTests)
  .then(waitUntilTestsComplete)
  .then(buildCoverallsCoverage)
  .then(postToCoveralls)
  .catch(onError || _.noop)
  .done(onComplete || _.noop);
};
