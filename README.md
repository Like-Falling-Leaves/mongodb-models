# mongodb-models

This is a small module which helps model the relationship between objects on mongodb.

[![NPM info](https://nodei.co/npm/mongodb-models.png?downloads=true)](https://npmjs.org/package/mongodb-models)

[![Travis build status](https://api.travis-ci.org/Like-Falling-Leaves/mongodb-models.png?branch=master)](
https://travis-ci.org/Like-Falling-Leaves/mongodb-models)

## Install

    npm install mongodb-models

## Initialization

```javascript

   // Initialization via mongo URLs of the form: mongodb://user:password@host:port/database
   var modeler = require('mongodb-models')({mongoUrl: 'mongodb://user:password@host:port/database'});

```

## API

This document is a work in progress.  There is a decent amount of documentation that is autogenerated from the examples in the unit test.  Please use [this](https://github.com/Like-Falling-Leaves/mongodb-models/blob/master/examples.md) as a reference for how to using [links](https://github.com/Like-Falling-Leaves/mongodb-models/blob/master/examples.md#using-links) and [fast-links](https://github.com/Like-Falling-Leaves/mongodb-models/blob/master/examples.md#using-fast-links).

The documentation below is more in the nature of introducing what the module is about.

### createClass

The createClass method can be used to create a class.  Note that the properties of the class itself are not modeled here and there is no support (yet) for saving, modifying etc as in mongoose.  This module is more about modeling properties of an object that need to be fetched from other objects.  In other words, modeling relationships.

```javascript

   var Topic = modeler.createClass('Topic' /* class name */, 'topics' /* collection name */);
   var Subscriber = modeler.createClass('Subscriber', 'subscribers');
   var Comment = modeler.createClass('Comment', 'comments');

```

Creating a class immediately provides a few helper functions.

```javascript

   Topic.create.one({name: 'something'}, done);
   // Note that there is no validation provided here.  The only service provided is an ID service
   // which uses database counters to provide a small unique ID

   // You can also find topics by doing the following:
   Topic.find.byId(id, done);
   Topic.find.byIds(ids, done);

   // You can also find or create ids which is useful.  
   Topic.find.orCreate(id, {name: 'something'}, done);

   // Sometimes you want to find or create by an alternate index.  If you have
   // mongodb 2.6 or higher, you can do that.  Note that the following would fail
   // on earlier versions of mongodb.
   // Imagine creating user objects by FB ID.  This can be a unique index!
   User.find.orCreate({fbid: <signedInUserFbId>}, {name: 'Some User'}, done);

```
   
### addReference and addLink.

Adding links is the main value of the module.  Adding links automatically opens up methods that will allow fetching other objects from this one.  There are two kinds of these relationships: reference and link.  References are just the database ids of other objects. For example, a *topic* object may have a reference to the *author* by storing the *authorId*.

*Links*, on the other hand, are a 1-to-many or many-to-many relationship.  These are commonly stored in a separate collection (with each entry in the collection just holding the reference to the two objects that are linked).

Links are powerful because they allow storing a small or a large number of objects and are symmetric (you can query the link give one id in the pair of ids that make up a link).  They help model complex relationships easily and also oftentimes the relationsips change more often than the base document and so modeling things this way is better for caching and such.

This module offers two types of links:  simple *links* are stored in a separate collection while *fast-links* is a compromise -- with a certain limit, the links are stored directly on the originating object and once the number of links goes high, it switches to saving it in a separate collection.  The motivation for fast-links is that often times, most objects dont have many connections and having to fetch a second collection is unnecessary.  Instead, that is only done for objects which have a large number of links.  In addition, fast-links maintain a count of outbound links from an object which is useful.  The compromise with fast-links is that the symmetry between the source object and the destination object is broken since the source object natively maintains a sub-document with the list of IDs of the destination object.

More details on:
- [Using links](https://github.com/Like-Falling-Leaves/mongodb-models/blob/master/examples.md#using-links)
- [Using fast links](https://github.com/Like-Falling-Leaves/mongodb-models/blob/master/examples.md#using-fast-links)

#### Installing References

References are a much simpler version of links where a particular object just has the id of the other object.

```javascript

   Topic.addReference('author', 'authorId', Subscriber);

   // all topics will now have an 'author' property which will expand to 
   // a 'Subscriber' object using the 'authorId' field.

   topic.author(function (err, Subscriber) {
     // boom!
   });
```

#### Installing a link between two classes

The [Using links](https://github.com/Like-Falling-Leaves/mongodb-models/blob/master/examples.md#using-links) article has more details.

```javascript

   Topic.addLink(
     'comments', 
        // all Topic instances will get a bunch of link properties named off of
        // the first parameter ("comments") such as addComments, removeComments,
        // comments etc.
     '_id',
        // each link stores two database-ids.  This refers to the field in topic 
        // where the id is stored.  See the query option below -- this id is
        // used where the current class 'Topic' is provided before quering the 
        // database for links.
     {query: {topicId: Topic, commentId: Comment}},
        // the options field provides the query, sort, limit options to use.
        // Note that the query field is sort of a template: wherever a class
        // is provided as a key, it is replaced with a database id derived from 
        // that instance.
     "topicComments"
        // the collection where the database pairs are stored.
   )

````

When a link has been installed, it can be used to create a connection between the two objects.

```javascript

   // Continuing with that example, you can create a comment on a topic as follows:

   var topic = Topic.create.one({...}, done);
   ...
   var comment = Comment.create.one({..}, done);
   ...
   topic.addComment(comment, done);

   // this ends up adding a row in the "topicComments" collecition, which looks like:
   // {topicId: topic._id, commentId: comment._id}
   // Now it is possible to browse all topics connected to a comment and vice-versa using
   // this.

```

It is also possible to explore other objects connected via links.

```javascript

   // Lets find all comments on a topic.
   topic.comments(function (err, comments) {
     // boom!
   });

````

If you want to query the existence of a link, you can do that via the find methods.


```javascript
   // Lets find all comments on a topic.
   topic.comments(function (err, comments) {
     // now lets find if topic has a specific comment.
     topic.findComment(commentId, function (err, foundComment) {
       // if commentId is linked to <topic>, that specific comment is fetched   
       // as foundComment.
     });

     // sometimes you only want to check if an id is linked, not find the 
     // associated object.  For example, testing if a userId is a subscriber.
     topic.findSubscriberId(userId, function (err, subId) {
       // if userId *is* a subscriber, then subId == userId
     });
   });

```

#### Installing a fast link between two classes

A fast link is almost exactly the same as a regular link with respect to usage.  The only exception is that it is possible to fetch a count of links since this is maintained on the source object for all fast links.

The [Using fast links](https://github.com/Like-Falling-Leaves/mongodb-models/blob/master/examples.md#using-fast-links) article has more details.
