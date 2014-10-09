var mongodb = require('mongodb');
var counter = require('mongodb-counter');
var wrap = require('syncwrap');
var _ = require('lazy.js');

module.exports = modeler;
function modeler(options) {
  var counters = counter.createCounters(
    _({}).assign(options).assign({collectionName: options.countersCollectionName}).value()
  );
  var db = wrap(mongodb.MongoClient.connect, mongodb.MongoClient, [options.mongoUrl]);
  var classes = {};
  return {
    createClass: createClass,
    getClass: getClass,
    createObject: createObject,
    findObject: findObject,
  };

  function createClass(name, collectionName, countersName) {
    classes[name] = init;

    // public methods
    init.fromData = fromData(init);
    init.create = createObject(init);
    Object.defineProperty(init, 'find', {get: inherit('find', findObject(init))});
    init.addReference = addReference.bind(null, init);
    init.addLink = addLink.bind(null, init);

    // semi-private data
    init.collection = db.get('collection').execSync(collectionName || name);
    init.counters = counters(countersName || name);

    return init;
    function init(obj) {
      if (!this) return new init(obj);
      obj = obj || {};
      for (var key in obj) if (obj.hasOwnProperty(key)) this[key] = obj[key];
      return this;
    }
  }


  function fromData(type) {
    return function (info) { 
      if (info instanceof Array) return _(info).map(type.fromData).value();
      return new type(info); 
    };
  }

  function createObject(type) {
    if (typeof(type) == 'string') type = classes[type];
    return {one: createOne, many: createMany, ifNotExists: findOrCreateOne};

    function createOne(info, done) {
      fixupTime(info);
      var infoWithId = info._id  ? info : setId.wrap(info, type.counters.getNextUniqueId.wrap()).sync(true);
      var created = type.collection.method('insert', infoWithId).get('0');
      return type.fromData.wrapped(created).sync(true).done(done || noop)();
    }

    function createMany(infoArray, done) {
      var infosWithId = _(infoArray).map(function (obj) {
        fixupTime(obj);
        return obj._id ? obj : setId.wrap(info, type.counters.getNextUniqueId.wrap()).sync(true);
      }).value();
      var created = type.collection.get('insert').exec(unwrap.wrap(infoArray));
      return type.fromData.wrapped(created).sync(true).done(done || noop)();
    }

    function findOrCreateOne(id, info, done) { return type.find.orCreate(id, info, done); }
  }

  function findObject(type) {
    if (typeof(type) == 'string') type = classes[type];
    return {byId: findById, byIds: findByIds, bySearch: findBySearch, orCreate: findOrCreate};

    function findById(id, done) { return findBySearch.call(this, {_id: id, deleted: {$ne: 1}}, done); }
    function findByIds(ids, done) { return findBySearch.call(this, {_id: {$in: ids}, deleted: {$ne: 1}}, done); }
    function findBySearch() {
      var query = {}, sort = {_id: 1}, skip = 0, limit = 0, done = noop;
      var args = Array.prototype.slice.call(arguments);
      if (typeof(args[args.length - 1]) == 'function') done = args.pop(); 
      if (typeof(args[0]) == 'object') query = args.shift();
      if (typeof(args[0]) == 'object') sort = args.shift();
      if (!isNaN(parseInt(args[0]))) skip = parseInt(args.shift());
      if (!isNaN(parseInt(args[0]))) limit = parseInt(args.shift());

      var search = type.collection.methodSync('find', query).methodSync('sort', sort);
      if (skip) search.methodSync('skip', skip);
      if (limit) search.methodSync('limit', limit);
      return type.fromData.wrapped(search.method('toArray')).sync(true).done(done)();
    }      
    function findOrCreate(id, info, done) {
      return type.collection.method('findAndModify', {_id: id}, {_id: 1}, {$setOnInsert: info}, {new: true, upsert: true}).done(done || noop)();
    }
  }

  function addReference(type, property, field, otherType) {
    type.prototype[property[0].toLowerCase() + property.slice(1)] = getProperty;
    return type;
    function getProperty(done) {
      return otherType.fromData.wrapped(this[field]).sync(true).done(done || noop);
    }
  }

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

    return type;

    function findLinkIds(ids, done) {
      var ret = db.get('collection').exec(linkCollectionName)
        .methodSync('find', getQuery.wrapped(this[field], ids).sync(true))
        .methodSync('sort', searchOptions.sort || {})
        .methodSync('skip', searchOptions.skip || 0);
      if (searchOptions.limit) ret.methodSync('limit', searchOptions.limit);
      return ret.method('toArray')
        .lazyjs().methodSync('pluck', otherQueryField).methodSync('value')
        .done(done || noop)();
    }
    function findLinkId(id, done) { return findLinkIds.call(this, [id]).get('0').done(done || noop)(); }
    function findLinks(ids, done) {
      return query[otherQueryField].find.byIds.wrapped(findLinkIds.call(this, ids)).done(done || noop)(); 
    }
    function findLink(id, done) { return findLinks.call(this, [id]).get('0').done(done || noop)(); }
  
    function getLinkIds(done) {
      var ret = db.get('collection').exec(linkCollectionName)
        .methodSync('find', getQuery.wrapped(this[field]).sync(true))
        .methodSync('sort', searchOptions.sort || {})
        .methodSync('skip', searchOptions.skip || 0);
      if (searchOptions.limit) ret.methodSync('limit', searchOptions.limit);
      return ret.method('toArray')
        .lazyjs().methodSync('pluck', otherQueryField).methodSync('value')
        .done(done || noop)();
    }
    function getLinkId(done) { return getLinkIds.call(this).get('0').done(done || noop)(); }
    function getLinks(done) {
      return query[otherQueryField].find.byIds.wrapped(getLinkIds.call(this)).done(done || noop)();
    }
    function getLink(done) { return getLinks.call(this).get('0').done(done || noop)(); }

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
        .done(done || noop)();
    }

    function addLinkIds(ids, done) {
      var self = this;
      var ww = _(ids).map(function (id) { return addLinkId.call(self, id); }).value();
      return wrap.unwrap(ww).done(done || noop)();
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

    function addLink(other, done) { return addLinks.call(this, [other]).get('0').done(done || noop)(); }
    function addLinks(others, done) { return addLinkIds.call(this, _(others).pluck('_id').value(), done); }

    function removeLinkIds(ids, done) {
      return db.get('collection').exec(linkCollectionName)
        .method(
          'update', 
          getQuery(this[field], ids),
          {$set: {deleted: 1, deletedTime: new Date().getTime()}},
          {multi: true}
        ).successValue(ids)
        .done(done || noop)();
    }
    function removeLinkId(ids, done) { return removeLinkIds.call(this, [id]).get('0').done(done || noop)(); }
    function removeLink(other, done) { return removeLinks.call(this, [other]).get('0').done(done || noop)(); }
    function removeLinks(others, done) { return removeLinkIds.call(this, _(others).pluck('_id').value(), done); }
  }

  function getClass(className) { return classes[className]; }
}

function fixupTime(info) {
  var now = new Date().getTime();
  if (!info.createdTime) info.createdTime = now;
  if (!info.updatedTime) info.updatedTime = now;
  return info;
}
  
function setId(info, id) { info._id = id.toString(36); return info; }
function noop() {}
function logIt() { console.log('Finished', arguments); }
function inherit(name, obj) { 
  return function () {
    if (this['_' + name]) return this['_' + name];
    var ret = this['_' + name] = {};
    for (var key in obj) ret[key] = obj[key].bind(this);
    return ret;
  }
};
