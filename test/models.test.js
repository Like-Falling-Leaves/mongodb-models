var models = require('../models.js');
var assert = require('assert');

describe('Models', function () {
  // test with simulated class for topics, comments, subscribers, likes.
  var modeler = models({mongoUrl: 'mongodb://127.0.0.1/modelsTest'});
  var Topic = modeler.createClass('Topic', 'topics');
  var Comment = modeler.createClass('Comment', 'comments');
  var Subscriber = modeler.createClass('Subscriber', 'subscribers');
  Topic.addLink('comments', '_id', {query: {topicId: Topic, commentId: Comment}}, 'topicComments')
    .addLink('subscribers', '_id', {query: {topicId: Topic, subscriberId: Subscriber}}, 'topicSuscribers')
    .addLink('likes', '_id', {query: {postId: Topic, subscriberId: Subscriber, type: 'topic'}}, 'postLikes')
    .addReference('author', 'authorId', Subscriber);

  Comment.addLink('topics', '_id', {query: {topicId: Topic, commentId: Comment}}, 'topicComments')
    .addLink('likes', '_id', {query: {postId: Comment, subscriberId: Subscriber, type: 'comment'}}, 'postLikes')
    .addReference('author', 'authorId', Subscriber);

  Subscriber.addLink('likedTopics', '_id', {query: {postId: Topic, subscriberId: Subscriber, type: 'topic'}}, 'postLikes')
    .addLink('likedComments', '_id', {query: {postId: Comment, subscriberId: Subscriber, type: 'comment'}}, 'postLikes')
    .addLink('subscribedTopics', '_id', {query: {topicId: Topic, subscriberId: Subscriber}}, 'topicSubscribers');

  var topics = [];
  var subscribers = [];
  var comments = [];

  it('should create objects: subscribers', function (done) {
    Subscriber.create.one({email: 'some@example.com'}, function (err, sub) {
      assert.ok(!err);
      assert.ok(sub instanceof Subscriber);
      assert.equal(sub.email, 'some@example.com');
      subscribers.push(sub);
      done();
    });
  });

  it('should create objects and add link: topic', function (done) {
    Topic.create.one({name: 'Some topic', authorId: subscribers[0]._id}, function (err, topic) {
      assert.ok(!err);
      assert.ok(topic instanceof Topic);
      assert.equal(topic.name, 'Some topic');
      topics.push(topic);
      done();
    });
  });

  it('should create objects and add Link: comment', function (done) {
    var author = subscribers[0];
    var topic = topics[0];
    Comment.create.one({body: 'Some comment', authorId: author._id}, function (err, comment) {
      assert.ok(!err);
      assert.ok(comment instanceof Comment);
      assert.equal(comment.body, 'Some comment');
      comments.push(comment);
      topic.addSubscriber(author, function (err) {
        assert.ok(!err);
        topic.addComment(comment, function (err) {
          assert.ok(!err);
          topic.comments(function (err, comments) {
            assert.ok(!err);
            assert.equal(comments.length, 1);
            assert.ok(comments[0] instanceof Comment);
            assert.equal(comments[0]._id, comment._id);

            topic.subscribers(function (err, subs) {
              assert.ok(!err);
              assert.equal(subs.length, 1);
              assert.ok(subs[0] instanceof Subscriber);
              assert.equal(subs[0]._id, author._id);
              done();
            });
          });
        });
      });
    });
  });

});