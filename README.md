# mongodb-models

This is a small module which helps model the relationshiop between objects on mongodb.

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

This document is a work in progress.  Please read the unit tests to understand what can be done.

### createClass

The createClass method can be used to create a class.  Note that the properties of the class itself are not modeled here and there is no support for saving, modifying etc as in mongoose.  This is more about modeling properties of an object that need to be fetched from other objects.  In other words, modeling relationshiops.

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

Adding links is the main value of the module.  Adding links automatically opens up methods that will allow fetching other objects from this one.  There are two kinds of these relationships: reference and link.  References are just the database ids of other objects.  Links, on the other hand, are maintained on a separate table with a row for each link.  The row contains the database ids of the two objects that are linked together.  

Links are powerful because they allow storing a small or a large number of objects and are symmetric (you can query the link give one id in the pair of ids that make up a link).

#### Installing a link between two classes

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
