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
    type.prototype[property[0].toLowerCase() + property.slice(1)] = getLink;
    type.prototype[property[0].toLowerCase() + property.slice(1) + 's']  = getLinks;
    type.prototype[property[0].toLowerCase() + property.slice(1) + 'Id']  = getLinkId;
    type.prototype[property[0].toLowerCase() + property.slice(1) + 'Ids']  = getLinkIds;

    type.prototype['find' + property[0].toUpperCase() + property.slice(1)] = findLink;
    type.prototype['find' + property[0].toUpperCase() + property.slice(1) + 's']  = findLinks;
    type.prototype['find' + property[0].toUpperCase() + property.slice(1) + 'Id']  = findLinkId;
    type.prototype['find' + property[0].toUpperCase() + property.slice(1) + 'Ids']  = findLinkIds;
    
    type.prototype['add' + property[0].toUpperCase() + property.slice(1) + 'Id'] = addLinkId;
    type.prototype['add' + property[0].toUpperCase() + property.slice(1) + 'Ids'] = addLinkIds;
    type.prototype['add' + property[0].toUpperCase() + property.slice(1)] = addLink;
    type.prototype['add' + property[0].toUpperCase() + property.slice(1) + 's'] = addLinks;

    type.prototype['remove' + property[0].toUpperCase() + property.slice(1) + 'Id'] = removeLinkId;
    type.prototype['remove' + property[0].toUpperCase() + property.slice(1) + 'Ids'] = removeLinkIds;
    type.prototype['remove' + property[0].toUpperCase() + property.slice(1)] = removeLink;
    type.prototype['remove' + property[0].toUpperCase() + property.slice(1) + 's'] = removeLinks;

    type['from' + property[0].toUpperCase() + property.slice(1) + 'Ids'] = fromLinkIds;
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
    function findLinkId(id, done) { return findLinkIds.call(this, [id]).get('0').done(done)(); }
    function findLinks(ids, done) {
      return query[otherQueryField].find.byIds.wrapped(findLinkIds.call(this, ids)).done(done)(); 
    }
    function findLink(id, done) { return findLinks.call(this, [id]).get('0').done(done)(); }
  
    function getLinkIds(done) {
      var query = getQuery(this[field]);
      var options = {sort: searchOptions.sort || {_id: -1}, skip: searchOptions.skip || 0};
      if (searchOptions.limit) options.limit = parseInt(searchOptions.limit);
      var ret = db.get('collection').exec(linkCollectionName).methodSync('find', query, options);
      return ret.method('toArray').applyToSync(_)
        .methodSync('pluck', otherQueryField).methodSync('compact').methodSync('value')
        .done(done)();
    }
    function getLinkId(done) { return getLinkIds.call(this).get('0').done(done)(); }
    function getLinks(done) {
      return query[otherQueryField].find.byIds.wrapped(getLinkIds.call(this)).done(done)();
    }
    function getLink(done) { return getLinks.call(this).get('0').done(done)(); }

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
      var options = {new: true, upsert: true};
      return db.get('collection').exec(linkCollectionName)
        .method('findAndModify', getQuery(this[field], [id]), {_id: 1}, insert, options)
        .successValue(id)
        .done(done)();
    }

    function addLinkIds(ids, done) {
      var self = this;
      var ww = _(ids).map(function (id) { return addLinkId.call(self, id); }).value();
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

    function addLink(other, done) { return addLinks.call(this, [other]).get('0').done(done)(); }
    function addLinks(others, done) { return addLinkIds.call(this, _(others).pluck('_id').value()).done(done)(); }

    function removeLinkIds(ids, done) {
      return db.get('collection').exec(linkCollectionName)
        .method(
          'update', 
          getQuery(this[field], ids),
          {$set: {deleted: 1, deletedTime: new Date().getTime()}},
          {multi: true}
        ).successValue(ids)
        .done(done)();
    }
    function removeLinkId(id, done) { return removeLinkIds.call(this, [id]).get('0').done(done)(); }
    function removeLink(other, done) { return removeLinks.call(this, [other]).get('0').done(done)(); }
    function removeLinks(others, done) { return removeLinkIds.call(this, _(others).pluck('_id').value(), done); }
  }
}
