var _ = require('lazy.js');
var wrap = require('syncwrap');
var fixupTime = require('./fixupTime');
var link = require('./link');

module.exports = fastLink;

function fastLink(db) {
  return {addLink: addLink};

  function addLink(type, property, field, searchOptions, linkCollectionName) {
    link(db).addLink(type, property, field, searchOptions, linkCollectionName);

    var cachePropName = 'fastLinkCache' + property[0].toUpperCase() + property.slice(1);
    if (property.slice(-1).toLowerCase() == 's') property = property.slice(0, -1);

    var cacheSize = (searchOptions || {}).cacheSize || 20;

    var pGetLink = property[0].toLowerCase() + property.slice(1);
    var pGetLinks = pGetLink + 's', pGetLinkId = pGetLink + 'Id', pGetLinkIds = pGetLinkId + 's';
    var pFindLink = 'find' + property[0].toUpperCase() + property.slice(1);
    var pFindLinks = pFindLink + 's', pFindLinkId = pFindLink + 'Id', pFindLinkIds = pFindLinkId + 's';
    var pAddLink = 'add' + property[0].toUpperCase() + property.slice(1);
    var pAddLinks = pAddLink + 's', pAddLinkId = pAddLink + 'Id', pAddLinkIds = pAddLinkId + 's';
    var pRemoveLink = 'remove' + property[0].toUpperCase() + property.slice(1);
    var pRemoveLinks = pRemoveLink + 's', pRemoveLinkId = pRemoveLink + 'Id', pRemoveLinkIds = pRemoveLinkId + 's';
    var pFromLinkIds = 'from' + property[0].toUpperCase() + property.slice(1) + 'Ids';

    // override stuff!
    var oldFindLinkIds = type.prototype[pFindLinkIds];
    type.prototype[pFindLinkIds] = findLinkIds;

    var oldGetLinkIds = type.prototype[pGetLinkIds];
    type.prototype[pGetLinkIds] = getLinkIds;

    var oldAddLinkId = type.prototype[pAddLinkId];
    type.prototype[pAddLinkId] = addLinkId;

    var oldRemoveLinkIds = type.prototype[pRemoveLinkIds];
    type.prototype[pRemoveLinkIds] = removeLinkIds;

    type.prototype[pFromLinkIds] = fromCachedLinkIds;

    Object.defineProperty(type.prototype, pGetLinks + 'Count', {configurable: true, get: getLinksCount});
    return type;

    function fromCachedLinkIds(ids, done) { return done('Not yet implemented'); }    
    function findLinkIds(ids, done) { return findCachedLinkIds.wrapped(this, ids).done(done)(); }
    function getLinkIds(done) { return getCachedLinkIds.wrapped(this).done(done)(); }
    function addLinkId(id, done) { return addCachedLinkId.wrapped(this, id).done(done)(); }
    function removeLinkIds(ids, done) { return removeCachedLinkIds.wrapped(this, ids).done(done)(); }

    function findCachedLinkIds(obj, ids, done) {
      if (!obj[cachePropName]) return done(null, []);
      var ret = _(obj[cachePropName].linkIds || []).intersection(ids);
      if (!obj[cachePropName].cacheFull) return done(null, ret.value());
      // cache is full, also fetch from list to be sure
      return append.wrapped(oldFindLinkIds.call(obj, ids)).done(done)();

      function append(linkIds, done) { return done(null, ret.union(linkIds).intersection(ids).uniq().value()); }
    }

    function getLinksCount() {
      if (!this[cachePropName]) return 0;
      return this[cachePropName].count || 0;
    }

    function getCachedLinkIds(obj, done) {
      if (!obj[cachePropName]) return done(null, []);
      var ret = obj[cachePropName].linkIds || [];
      if (!obj[cachePropName].cacheFull) return done(null, ret);
      // cache is full, also fetch from list to be sure.
      return append.wrapped(oldGetLinkIds.call(obj)).done(done)();
      
      function append(linkIds, done) { return done(null, _(ret.concat(linkIds)).uniq().value()); }
    }

    function addCachedLinkId(obj, id, done) {
      var update = {$addToSet: {}, $inc: {}};
      var cache = obj[cachePropName];
      if (!cache) obj[cachePropName] = cache = {linkIds: [], count: 0};
      if (_(cache.linkIds).contains(id)) return done(null, id);
      if (cache.cacheFull) return increment.wrapped(oldAddLinkId.call(obj, id)).done(done)();
      cache.linkIds.push(id);
      cache.count ++;
      update.$inc[cachePropName + '.count'] = 1;
      update.$addToSet[cachePropName + '.linkIds'] = id;
      if (cache.linkIds.length >= cacheSize) {
        cache.cacheFull = true;
        update.$set = {};
        update.$set[cachePropName + '.cacheFull'] = true;
      }
      return type.collection.method('update', {_id: obj._id}, update).successValue(id).done(done)();

      function increment(prevId, done) {
        if (prevId) return done(null, prevId);
        var op = {$inc: {}};
        op.$inc[cachePropName + '.count'] = 1;
        obj[cachePropName].count ++;
        return type.collection.method('update', {_id: obj._id}, op).successValue(prevId).done(done)();
      }
    }

    function removeCachedLinkIds(obj, ids, done) {
      var cache = obj[cachePropName];
      if (!cache) return done(null, 0);
      var decr = _(cache.linkIds).intersection(ids).value().length;
      cache.linkIds = _(cache.linkIds).difference(ids).value();
      var update = {$pullAll: {}, $inc: {}};
      update.$pullAll[cachePropName + '.linkIds'] = ids;
      return updateObj.wrapped(cache.cacheFull ? oldRemoveLinkIds.call(obj, ids) : 0).done(done)();

      function updateObj(deletedCount, done) {
        decr += deletedCount;
        if (isNaN(decr)) return done('Unexpected: ' + JSON.stringify(deletedCount));
        if (!decr) return done(null, decr);
        update.$inc[cachePropName + '.count'] = -decr;
        cache.count -= decr;
        return type.collection.method('update', {_id: obj._id}, update).successValue(deletedCount).done(done)();
      }
    }
  }
}
