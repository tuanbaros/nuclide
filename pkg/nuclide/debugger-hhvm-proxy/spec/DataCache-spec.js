'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */


var {uncachedRequire} = require('nuclide-test-helpers');
var {
  remoteObjectIdOfObjectId,
  createContextObjectId,
  pagedObjectId,
  singlePageObjectId,
} = require('../lib/ObjectId');
var { STATUS_BREAK, STATUS_RUNNING } = require('../lib/DbgpSocket');

const PROPERTIES = ['property'];
const CONVERTED_PROPERTIES = ['converted-properties'];
const EXPRESSION = ['expression'];

describe('debugger-hhvm-proxy DataCache', () => {
    var socket;
    var cache;

    var contextId = createContextObjectId(1, 2, 3);
    var contextRemoteId = remoteObjectIdOfObjectId(contextId);
    var pagedId = pagedObjectId(contextId, 'fullname-value',
      {pagesize: 32, startIndex: 0, count: 42});
    var pagedRemoteId = remoteObjectIdOfObjectId(pagedId);
    var singlePageId = singlePageObjectId(contextId, 'fullname-value', 42);
    var singlePageRemoteId = remoteObjectIdOfObjectId(singlePageId);
    var convertProperties;
    var getPagedProperties;
    var convertValue;
    var statusCallback;

    beforeEach(() => {

      socket = jasmine.createSpyObj('socket', ['getContextsForFrame']);
      socket.getContextsForFrame = jasmine.createSpy('getContextsForFrame').
      andReturn(Promise.resolve([
        {
          name: 'Locals',
          id: '0',
        },
        {
          name: 'Superglobals',
          id: '1',
        },
        {
          name: 'User defined constants',
          id : '2',
        },
      ]));
      socket.onStatus = callback => { statusCallback = callback; };
      statusCallback = null;

      var properties = require('../lib/properties');
      convertProperties = spyOn(properties, 'convertProperties').andReturn(CONVERTED_PROPERTIES);
      getPagedProperties = spyOn(properties, 'getPagedProperties').andReturn(CONVERTED_PROPERTIES);

      var values = require('../lib/values');
      convertValue = spyOn(values, 'convertValue').andReturn(EXPRESSION);

      var {DataCache} = uncachedRequire(require, '../lib/DataCache');
      cache = new DataCache(socket);
    });
    function enable() {
      statusCallback(STATUS_BREAK);
    }
    function disable() {
      statusCallback(STATUS_RUNNING);
    }

    it ('no enable', () => {
      waitsForPromise(
        {shouldReject: true, timeout: 0},
        async () => { await cache.getScopesForFrame(4); });
    });

    it ('enable/disable', () => {
      waitsForPromise(
        {shouldReject: true, timeout: 0},
        async () => {
          enable();
          disable();
          await cache.getScopesForFrame(4);
        });
    });

    it('getScopesForFrame', () => {
      waitsForPromise(async () => {
        enable();
        var result = await cache.getScopesForFrame(42);

        expect(socket.getContextsForFrame).toHaveBeenCalledWith(42);
        expect(result).toEqual([
          {
            object: {
              description: 'Locals',
              type: 'object',
              objectId: '{"enableCount":1,"frameIndex":42,"contextId":"0"}',
            },
            type: 'local',
          },
          {
            object: {
              description: 'Superglobals',
              type: 'object',
              objectId: '{"enableCount":1,"frameIndex":42,"contextId":"1"}',
            },
            type: 'global',
          },
          {
            object: {
              description: 'User defined constants',
              type: 'object',
              objectId: '{"enableCount":1,"frameIndex":42,"contextId":"2"}',
            },
            type: 'global',
          },
        ]);
      });
    });

    it('getProperties - context', () => {
      waitsForPromise(async () => {
        socket.getContextProperties = jasmine.createSpy('getContextProperties').
          andReturn(Promise.resolve(PROPERTIES));

        enable();
        var result = await cache.getProperties(contextRemoteId);
        expect(result).toEqual(CONVERTED_PROPERTIES);
        expect(socket.getContextProperties).toHaveBeenCalledWith(2, 3);
        expect(convertProperties).toHaveBeenCalledWith(contextId, PROPERTIES);
      });
    });

    it('getProperties - paged', () => {
      waitsForPromise(async () => {
        enable();
        var result = await cache.getProperties(pagedRemoteId);
        expect(result).toEqual(CONVERTED_PROPERTIES);
        expect(getPagedProperties).toHaveBeenCalledWith(pagedId);
      });
    });

    it('getProperties - single page', () => {
      waitsForPromise(async () => {
        socket.getPropertiesByFullname = jasmine.createSpy('getPropertiesByFullname').
          andReturn(Promise.resolve(PROPERTIES));
        enable();
        var result = await cache.getProperties(singlePageRemoteId);
        expect(result).toEqual(CONVERTED_PROPERTIES);
        expect(socket.getPropertiesByFullname).toHaveBeenCalledWith(2, 3, 'fullname-value', 42);
        expect(convertProperties).toHaveBeenCalledWith(singlePageId, PROPERTIES);
      });
    });

    it('evaluateOnCallFrame', () => {
      waitsForPromise(async () => {
        socket.evaluateOnCallFrame = jasmine.createSpy('evaluateOnCallFrame')
          .andReturn(Promise.resolve({result: PROPERTIES, wasThrown: false}));
        enable();
        var result = await cache.evaluateOnCallFrame(5, 'expression');
        expect(socket.evaluateOnCallFrame).toHaveBeenCalledWith(5, 'expression');
        expect(convertValue).toHaveBeenCalledWith({
            enableCount : 1,
            frameIndex : 5,
            contextId : 'Watch Context Id',
          },
          PROPERTIES);
        expect(result).toEqual({
          result: EXPRESSION,
          wasThrown: false,
        });
      });
    });
});
