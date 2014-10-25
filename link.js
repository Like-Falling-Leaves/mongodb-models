var _ = require('lazy.js');
var wrap = require('syncwrap');
var fixupTime = require('./fixupTime');

module.exports = link;

function link(db) {
  return {addLink: addLink};

  function addLink(type, property, field, searchOptions, linkCollectionName) {
    var ownQueryField = null, otherQueryField = null, query = searchOptions.query;
    for (var key in query) { 
      if (query[key] === type) ownQueryField = key; 
      else if (typeof(query[key]) == 'function') otherQueryField = key;
    }
    if (property.slice(-1).toLowerCase() == 's') property = property.slice(0, -1);

    var pGetLink = property[0].toLowerCase() + property.slice(1);
    var pGetLinks = pGetLink + 's', pGetLinkId = pGetLink + 'Id', pGetLinkIds = pGetLinkId + 's';
    var pFindLink = 'find' + property[0].toUpperCase() + property.slice(1);
    var pFindLinks = pFindLink + 's', pFindLinkId = pFindLink + 'Id', pFindLinkIds = pFindLinkId + 's';
    var pAddLink = 'add' + property[0].toUpperCase() + property.slice(1);
    var pAddLinks = pAddLink + 's', pAddLinkId = pAddLink + 'Id', pAddLinkIds = pAddLinkId + 's';
    var pRemoveLink = 'remove' + property[0].toUpperCase() + property.slice(1);
    var pRemoveLinks = pRemoveLink + 's', pRemoveLinkId = pRemoveLink + 'Id', pRemoveLinkIds = pRemoveLinkId + 's';
    var pFromLinkIds = 'from' + property[0].toUpperCase() + property.slice(1) + 'Ids';

    type.prototype[pGetLink] = getLink;
    type.prototype[pGetLinks]  = getLinks;
    type.prototype[pGetLinkId]  = getLinkId;
    type.prototype[pGetLinkIds]  = getLinkIds;

    type.prototype[pFindLink] = findLink;
    type.prototype[pFindLinks]  = findLinks;
    type.prototype[pFindLinkId]  = findLinkId;
    type.prototype[pFindLinkIds]  = findLinkIds;

    type.prototype[pAddLinkId] = addLinkId;
    type.prototype[pAddLinkIds] = addLinkIds;
    type.prototype[pAddLink] = addLink;
    type.prototype[pAddLinks] = addLinks;

    type.prototype[pRemoveLinkId] = removeLinkId;
    type.prototype[pRemoveLinkIds] = removeLinkIds;
    type.prototype[pRemoveLink] = removeLink;
    type.prototype[pRemoveLinks] = removeLinks;

    type[pFromLinkIds] = fromLinkIds;
    return type;

    function fromLinkIds(ids, done) {
      var query = getQuery(null, ids);
      delete query[ownQueryField];
      var options = {sort: searchOptions.sort || {_id: -1}, skip: searchOptions.skip || 0};
      if (searchOptions.limit) options.limit = parseInt(searchOptions.limit);
      var ret = db.get('collection').exec(linkCollectionName).methodSync('find', query, options);
      return type.find.byIds.wrapped(
        ret.method('toArray').applyToSync(_)
          .methodSync('pluck', ownQueryField).methodSync('compact').methodSync('value')
      ).done(done);
    }

    function findLinkIds(ids, done) {
      var query = getQuery(this[field], ids);
      var options = {sort: searchOptions.sort || {_id: -1}, skip: searchOptions.skip || 0};
      if (searchOptions.limit) options.limit = parseInt(searchOptions.limit);
      var ret = db.get('collection').exec(linkCollectionName).methodSync('find', query, options);
      return ret.method('toArray').applyToSync(_)
        .methodSync('pluck', otherQueryField).methodSync('compact').methodSync('value')
        .done(done)();
    }
    function findLinkId(id, done) { return this[pFindLinkIds]([id]).get('0').done(done)(); }
    function findLinks(ids, done) {
      return query[otherQueryField].find.byIds.wrapped(this[pFindLinkIds](ids)).done(done)(); 
    }
    function findLink(id, done) { return this[pFindLinks]([id]).get('0').done(done)(); }
  
    function getLinkIds(done) {
      var query = getQuery(this[field]);
      var options = {sort: searchOptions.sort || {_id: -1}, skip: searchOptions.skip || 0};
      if (searchOptions.limit) options.limit = parseInt(searchOptions.limit);
      var ret = db.get('collection').exec(linkCollectionName).methodSync('find', query, options);
      return ret.method('toArray').applyToSync(_)
        .methodSync('pluck', otherQueryField).methodSync('compact').methodSync('value')
        .done(done)();
    }
    function getLinkId(done) { return this[pGetLinkIds]().get('0').done(done)(); }
    function getLinks(done) {
      return query[otherQueryField].find.byIds.wrapped(this[pGetLinkIds]()).done(done)();
    }
    function getLink(done) { return this[pGetLinks]().get('0').done(done)(); }

    function getQuery(ownFieldValue, ids) { 
      var ret = _({}).assign(query).value();
      if (ids) ret[otherQueryField] = {$in: ids};
      else delete ret[otherQueryField];
      ret[ownQueryField] = ownFieldValue;
      ret.deleted = {$ne: 1};
      return ret;
    }

    function addLinkId(id, done) {
      var insert = {$setOnInsert: getDocument(this[field], id)};
      var options = {upsert: true};
      return db.get('collection').exec(linkCollectionName)
        .method('findAndModify', getQuery(this[field], [id]), {_id: 1}, insert, options)
        .get('_id').done(done)();
    }

    function addLinkIds(ids, done) {
      var self = this;
      var ww = _(ids).map(function (id) { return self[pAddLinkId](id); }).value();
      return wrap.unwrap(ww).done(done)();
    }

    function getDocuments(ownFieldValue, ids) { 
      return _(ids).map(getDocument.bind(null, ownFieldValue)).value(); 
    }
    function getDocument(ownFieldValue, id) {
      var ret = _({}).assign(query).value();
      ret[otherQueryField] = id;
      ret[ownQueryField] = ownFieldValue;
      fixupTime(ret);
      return ret;
    }

    function addLink(other, done) { return this[pAddLinks]([other]).get('0').done(done)(); }
    function addLinks(others, done) { return this[pAddLinkIds](_(others).pluck('_id').value()).done(done)(); }

    function removeLinkIds(ids, done) {
      return db.get('collection').exec(linkCollectionName)
        .method(
          'update', 
          getQuery(this[field], ids),
          {$set: {deleted: 1, deletedTime: new Date().getTime()}},
          {multi: true}
        ).done(done)();
    }
    function removeLinkId(id, done) { return this[pRemoveLinkIds]([id]).done(done)(); }
    function removeLink(other, done) { return this[pRemoveLinks]([other]).done(done)(); }
    function removeLinks(others, done) { return this[pRemoveLinkIds](_(others).pluck('_id').value(), done); }
  }
}

