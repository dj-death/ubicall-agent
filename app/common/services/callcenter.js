'use strict';

/**
 * @ngdoc service
 * @name agentUiApp.CallCenter
 * @description
 * # CallCenter
 * Service in the agentUiApp.
 */
angular.module('agentUiApp')
  .service('CallCenter', function ($http ,$rootScope, $log, $q , localStorageService,
                                   UiService, AuthToken, API_BASE, comms , rtmp) {
    var CallCenter = {};
//TODO :Use https://github.com/jmdobry/angular-cache instead
    var calls, queues, current_call;

    function _getCalls() {
      var deferred = $q.defer();
      if (calls) {
        deferred.resolve(calls);
      } else {
        $http.get(API_BASE + "/agent/calls").then(function (result) {
          calls = result.data;
          deferred.resolve(result.data);
        }, function (error) {
          deferred.reject(error.data);
        });
      }
      return deferred.promise;
    }

    function _getCall(callid, queueid) {
      var deferred = $q.defer();
      var done = false;
      var call;
      angular.forEach(calls, function (_call) {
        if (_call.id == callid && _call.queue_id == queueid && !done) {
          call = _getCallQueueName(_call);
          done = true;
        }
      });
      if( !done ){
        deferred.reject({message : 'unable to get call detail !'});
      } else {
        deferred.resolve(call );
      }
      return deferred.promise;
    }

    function _getCallQueueName(call) {
      angular.forEach(queues,function(queue){
        if (!call.queue && queue.queue_id == call.queue_id) {
          call.queue = queue.queue_name;
        }
      });
      return call;
    }

    CallCenter.init = function(){
      calls = queues = null ;
    };

    CallCenter.getAvailableCalls = function () {
      // moved to separate function , to call it from #getCallDetail
      return _getCalls();
    };

    CallCenter.getCallDetail = function (queueid, callid) {
      var deferred = $q.defer();
      if (!calls) {
        return _getCalls().then(function () {
          return _getCall(callid, queueid);
        });
      }
      return _getCall(callid, queueid);
    };

    CallCenter.getQueues = function () {
      var deferred = $q.defer();
      if (queues) {
        deferred.resolve(queues);
      } else {
        $http.get(API_BASE + "/agent/queues").then(function (result) {
          queues = result.data;
          deferred.resolve(result.data);
        }, function (error) {
          deferred.reject(error.data);
        });
      }
      return deferred.promise;
    };

    CallCenter.getMeCall = function (qid, qslug) {
      var deferred = $q.defer();
      $http.get(API_BASE + "/call/queue/" + qid + "/" + qslug)
        .then(function success(res) {
          current_call = _getCallQueueName(res.data);
          return deferred.resolve(current_call);
        }, function error(err) {
          rtmp.hangup();
          deferred.reject(err.data);
        });
      return deferred.promise;
    };

    CallCenter.hangup = function(meta){
      var deferred = $q.defer();
      meta = meta || {};
      meta.status = meta.status || '';
      $http({
        url: meta.status == 'done' ? API_BASE + "/call/" + current_call.id + "/done" : API_BASE + "/call/" + current_call.id + "/failed" ,
        method: "PUT",
        headers: {
          'x-call-action': meta.status == 'done' ? 'done' : 'retry' ,
          'x-call-error': meta.error ? meta.error : '',
          'x-call-duration': meta.duration
        }
      }).then(function success(res) {
          UiService.info(res.message);
          current_call = {};
          deferred.resolve({});
        }, function error(err) {
          //silent err
          current_call = {};
          deferred.resolve({});
        });
      return deferred.promise;
    }

    // generate dynamic topic layout for socket to subscribe
    var payload = AuthToken.payload();
    if (payload && payload.per && payload.per.notify) {
      for (var prev in payload.per.notify) {
        if (prev == "system") {
          angular.forEach(payload.per.notify["system"], function (item) {
            comms.subscribe(item, function (topic, result) {
              // There is No System wide events yet
              UiService.info(prev + " : " + topic + " : " + result.message);
            });
          });
        }
        if (prev == "api") {
          angular.forEach(payload.per.notify["api"], function (item) {
            var topicLayout = AuthToken.payload().lic + ":" + item
            comms.subscribe(topicLayout, function (topic, result) {
              // There is No Api wide events yet
              UiService.info(prev + " : " + topic + " : " + result.message);
            });
          });
        }
        if (prev == "agent") {
          angular.forEach(payload.per.notify["agent"], function (item) {
            var topicLayout = AuthToken.payload().api_key + ":" + AuthToken.payload().email + ":" + item ;
            comms.subscribe(topicLayout, function (topic, result) {
              // @deprecated event should not used any more
              if (item == "call:ringing") {
                // UiService.ring(result.message);
                // $rootScope.$broadcast("call:ringing");
              }
              if (item == "call:complete") {
                UiService.ok(result.message);
                $rootScope.$broadcast("call:complete");
              }
              if (item == "call:problem") {
                UiService.error(result.message);
                $rootScope.$broadcast("call:problem");
              }
              if (item == "call:warning") {
                UiService.grimace(result.message , {duration : 8000 , sticky : true});
              }
              if (item == "calls:updated") {
                Array.prototype.unshift.apply(calls, result.calls);
                UiService.info(result.message);
                $rootScope.$broadcast("calls:updated", calls);
              }
              if (item == "queues:updated") {
                queues = result.queues;
                UiService.info(result.message);
                $rootScope.$broadcast("queues:updated", queues);
              }
            });
          });
        }
      }
    }
    return CallCenter;
  }
);
