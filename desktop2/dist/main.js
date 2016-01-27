module.exports =
/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};

/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {

/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;

/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			exports: {},
/******/ 			id: moduleId,
/******/ 			loaded: false
/******/ 		};

/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);

/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;

/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}


/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;

/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;

/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";

/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ function(module, exports, __webpack_require__) {

	eval("'use strict';\n\nfunction _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }\n\nvar _react = __webpack_require__(1);\n\nvar _react2 = _interopRequireDefault(_react);\n\nvar _reactRouter = __webpack_require__(2);\n\nvar _reactRouter2 = _interopRequireDefault(_reactRouter);\n\nvar _componentsApp = __webpack_require__(3);\n\nvar _componentsApp2 = _interopRequireDefault(_componentsApp);\n\nvar _componentsSiteIndexSite = __webpack_require__(5);\n\nvar _componentsSiteIndexSite2 = _interopRequireDefault(_componentsSiteIndexSite);\n\nvar _componentsSiteCommentSite = __webpack_require__(6);\n\nvar _componentsSiteCommentSite2 = _interopRequireDefault(_componentsSiteCommentSite);\n\nvar routes = _react2['default'].createElement(\n  _reactRouter.Route,\n  { handler: _componentsApp2['default'] },\n  _react2['default'].createElement(_reactRouter.Route, { name: 'index', path: '/', handler: _componentsSiteIndexSite2['default'] }),\n  _react2['default'].createElement(_reactRouter.Route, { name: 'comment', path: '/comment', handler: _componentsSiteCommentSite2['default'] })\n);\n\n_reactRouter2['default'].run(routes, _reactRouter.HashLocation, function (Root) {\n  _react2['default'].render(_react2['default'].createElement(Root, null), document.body);\n});\n\n/*****************\n ** WEBPACK FOOTER\n ** ./src/js/main.es6\n ** module id = 0\n ** module chunks = 0\n **/\n//# sourceURL=webpack:///./src/js/main.es6?");

/***/ },
/* 1 */
/***/ function(module, exports) {

	eval("module.exports = require(\"react\");\n\n/*****************\n ** WEBPACK FOOTER\n ** external \"react\"\n ** module id = 1\n ** module chunks = 0\n **/\n//# sourceURL=webpack:///external_%22react%22?");

/***/ },
/* 2 */
/***/ function(module, exports) {

	eval("module.exports = require(\"react-router\");\n\n/*****************\n ** WEBPACK FOOTER\n ** external \"react-router\"\n ** module id = 2\n ** module chunks = 0\n **/\n//# sourceURL=webpack:///external_%22react-router%22?");

/***/ },
/* 3 */
/***/ function(module, exports, __webpack_require__) {

	eval("'use strict';\n\nObject.defineProperty(exports, '__esModule', {\n  value: true\n});\n\nfunction _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }\n\nvar _jquery = __webpack_require__(4);\n\nvar _jquery2 = _interopRequireDefault(_jquery);\n\nvar _react = __webpack_require__(1);\n\nvar _react2 = _interopRequireDefault(_react);\n\nvar _reactRouter = __webpack_require__(2);\n\nexports['default'] = _react2['default'].createClass({\n\n  displayName: 'App',\n\n  componentDidMount: function componentDidMount() {\n    this.adjustHeightForBeauty();\n  },\n\n  render: function render() {\n    return _react2['default'].createElement(\n      'div',\n      { className: 'site' },\n      _react2['default'].createElement(\n        'div',\n        { className: 'ui blue inverted menu' },\n        _react2['default'].createElement(\n          _reactRouter.Link,\n          { to: 'index', className: 'item' },\n          _react2['default'].createElement('i', { className: 'home icon' }),\n          ' Home'\n        ),\n        _react2['default'].createElement(\n          _reactRouter.Link,\n          { to: 'comment', className: 'item' },\n          _react2['default'].createElement('i', { className: 'comment icon' }),\n          ' Comment'\n        )\n      ),\n      _react2['default'].createElement(\n        'div',\n        { className: 'main container', ref: 'main' },\n        _react2['default'].createElement(_reactRouter.RouteHandler, null)\n      )\n    );\n  },\n\n  adjustHeightForBeauty: function adjustHeightForBeauty() {\n    var mainSectionHeight = (0, _jquery2['default'])(window).height();\n    (0, _jquery2['default'])(_react2['default'].findDOMNode(this.refs.main)).css('min-height', mainSectionHeight);\n  }\n\n});\nmodule.exports = exports['default'];\n\n/*****************\n ** WEBPACK FOOTER\n ** ./src/js/components/App.es6\n ** module id = 3\n ** module chunks = 0\n **/\n//# sourceURL=webpack:///./src/js/components/App.es6?");

/***/ },
/* 4 */
/***/ function(module, exports) {

	eval("module.exports = require(\"jquery\");\n\n/*****************\n ** WEBPACK FOOTER\n ** external \"jquery\"\n ** module id = 4\n ** module chunks = 0\n **/\n//# sourceURL=webpack:///external_%22jquery%22?");

/***/ },
/* 5 */
/***/ function(module, exports, __webpack_require__) {

	eval("'use strict';\n\nObject.defineProperty(exports, '__esModule', {\n  value: true\n});\n\nfunction _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }\n\nvar _react = __webpack_require__(1);\n\nvar _react2 = _interopRequireDefault(_react);\n\nexports['default'] = _react2['default'].createClass({\n\n  displayName: 'IndexSite',\n\n  render: function render() {\n    return _react2['default'].createElement(\n      'div',\n      null,\n      _react2['default'].createElement(\n        'h1',\n        null,\n        'Hello world'\n      )\n    );\n  }\n\n});\nmodule.exports = exports['default'];\n\n/*****************\n ** WEBPACK FOOTER\n ** ./src/js/components/site/IndexSite.es6\n ** module id = 5\n ** module chunks = 0\n **/\n//# sourceURL=webpack:///./src/js/components/site/IndexSite.es6?");

/***/ },
/* 6 */
/***/ function(module, exports, __webpack_require__) {

	eval("'use strict';\n\nObject.defineProperty(exports, '__esModule', {\n  value: true\n});\n\nfunction _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }\n\nvar _react = __webpack_require__(1);\n\nvar _react2 = _interopRequireDefault(_react);\n\nvar _reflux = __webpack_require__(!(function webpackMissingModule() { var e = new Error(\"Cannot find module \\\"reflux\\\"\"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));\n\nvar _reflux2 = _interopRequireDefault(_reflux);\n\nvar _underscore = __webpack_require__(7);\n\nvar _underscore2 = _interopRequireDefault(_underscore);\n\nvar _storesCommentStore = __webpack_require__(8);\n\nvar _storesCommentStore2 = _interopRequireDefault(_storesCommentStore);\n\nvar _actionsCommentActions = __webpack_require__(11);\n\nvar _actionsCommentActions2 = _interopRequireDefault(_actionsCommentActions);\n\nfunction getStoreState() {\n  return {\n    comments: _storesCommentStore2['default'].value() || []\n  };\n}\n\nexports['default'] = _react2['default'].createClass({\n\n  displayName: 'CommentSite',\n\n  mixins: [_reflux2['default'].listenTo(_storesCommentStore2['default'], 'onStoreChange')],\n\n  getInitialState: function getInitialState() {\n    return getStoreState();\n  },\n\n  onStoreChange: function onStoreChange() {\n    this.setState(getStoreState());\n  },\n\n  onCreateComment: function onCreateComment() {\n    var comment = _react2['default'].findDOMNode(this.refs.newComment);\n    _actionsCommentActions2['default'].create(comment.value);\n    comment.value = '';\n    comment.focus();\n    return false;\n  },\n\n  onRemoveComment: function onRemoveComment(commentID) {\n    _actionsCommentActions2['default'].remove(commentID);\n  },\n\n  render: function render() {\n    var _this = this;\n\n    return _react2['default'].createElement(\n      'div',\n      { className: 'ui minimal comments' },\n      _react2['default'].createElement(\n        'h3',\n        { className: 'ui dividing header' },\n        'Comments'\n      ),\n      _underscore2['default'].map(this.state.comments, function (comment) {\n        return _react2['default'].createElement(\n          'div',\n          { className: 'comment', key: comment.id },\n          _react2['default'].createElement(\n            'a',\n            { className: 'avatar' },\n            _react2['default'].createElement('img', { src: comment.user.avatar })\n          ),\n          _react2['default'].createElement(\n            'div',\n            { className: 'content' },\n            _react2['default'].createElement(\n              'a',\n              { className: 'author' },\n              comment.user.name\n            ),\n            _react2['default'].createElement(\n              'div',\n              { className: 'metadata' },\n              _react2['default'].createElement(\n                'span',\n                { className: 'date' },\n                comment.createdAt\n              )\n            ),\n            _react2['default'].createElement(\n              'div',\n              { className: 'text' },\n              comment.content\n            ),\n            _react2['default'].createElement(\n              'div',\n              { className: 'actions' },\n              _react2['default'].createElement(\n                'a',\n                { className: 'reply' },\n                'Reply'\n              ),\n              _react2['default'].createElement(\n                'a',\n                { className: 'remove',\n                  onClick: _underscore2['default'].partial(_this.onRemoveComment, comment.id) },\n                'Remove'\n              )\n            )\n          )\n        );\n      }),\n      _react2['default'].createElement(\n        'form',\n        { className: 'ui reply form' },\n        _react2['default'].createElement(\n          'div',\n          { className: 'field' },\n          _react2['default'].createElement('textarea', { name: 'content', ref: 'newComment' })\n        ),\n        _react2['default'].createElement(\n          'div',\n          { className: 'ui blue labeled submit icon button',\n            onClick: this.onCreateComment },\n          _react2['default'].createElement('i', { className: 'icon edit' }),\n          ' Add Reply'\n        )\n      )\n    );\n  }\n\n});\nmodule.exports = exports['default'];\n\n/*****************\n ** WEBPACK FOOTER\n ** ./src/js/components/site/CommentSite.es6\n ** module id = 6\n ** module chunks = 0\n **/\n//# sourceURL=webpack:///./src/js/components/site/CommentSite.es6?");

/***/ },
/* 7 */
/***/ function(module, exports) {

	eval("module.exports = require(\"underscore\");\n\n/*****************\n ** WEBPACK FOOTER\n ** external \"underscore\"\n ** module id = 7\n ** module chunks = 0\n **/\n//# sourceURL=webpack:///external_%22underscore%22?");

/***/ },
/* 8 */
/***/ function(module, exports, __webpack_require__) {

	eval("'use strict';\n\nObject.defineProperty(exports, '__esModule', {\n  value: true\n});\n\nfunction _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }\n\nvar _reflux = __webpack_require__(!(function webpackMissingModule() { var e = new Error(\"Cannot find module \\\"reflux\\\"\"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));\n\nvar _reflux2 = _interopRequireDefault(_reflux);\n\nvar _q = __webpack_require__(!(function webpackMissingModule() { var e = new Error(\"Cannot find module \\\"q\\\"\"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));\n\nvar _mixinsDBMixin = __webpack_require__(9);\n\nvar _mixinsDBMixin2 = _interopRequireDefault(_mixinsDBMixin);\n\nvar _actionsCommentActions = __webpack_require__(11);\n\nvar _actionsCommentActions2 = _interopRequireDefault(_actionsCommentActions);\n\nexports['default'] = _reflux2['default'].createStore({\n\n  mixins: [new _mixinsDBMixin2['default']('comment')],\n\n  listenables: [_actionsCommentActions2['default']],\n\n  onRemove: function onRemove(commentID) {\n    var _this = this;\n\n    _actionsCommentActions2['default'].remove.promise(new _q.Promise(function (resolve) {\n      _this.removeById(commentID);\n      resolve();\n      _this.trigger();\n    }));\n  },\n\n  onCreate: function onCreate(content) {\n    var _this2 = this;\n\n    _actionsCommentActions2['default'].create.promise(new _q.Promise(function (resolve) {\n      var comment = _this2.insert({\n        content: content,\n        createdAt: new Date(),\n        user: {\n          name: 'Foo',\n          avatar: 'http://semantic-ui.com/images/avatar/small/matt.jpg'\n        }\n      });\n      resolve(comment);\n      _this2.trigger(comment);\n    }));\n  },\n\n  onUpdate: function onUpdate(commentID, content) {\n    var _this3 = this;\n\n    _actionsCommentActions2['default'].update.promise(new _q.Promise(function (resolve) {\n      var comment = _this3.updateById(commentID, {\n        content: content\n      });\n      resolve(comment);\n      _this3.trigger(comment);\n    }));\n  }\n\n});\nmodule.exports = exports['default'];\n\n/*****************\n ** WEBPACK FOOTER\n ** ./src/js/stores/CommentStore.es6\n ** module id = 8\n ** module chunks = 0\n **/\n//# sourceURL=webpack:///./src/js/stores/CommentStore.es6?");

/***/ },
/* 9 */
/***/ function(module, exports, __webpack_require__) {

	eval("'use strict';\n\nObject.defineProperty(exports, '__esModule', {\n  value: true\n});\nexports['default'] = DBMixin;\n\nfunction _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }\n\nvar _underscoreDb = __webpack_require__(10);\n\nvar _underscoreDb2 = _interopRequireDefault(_underscoreDb);\n\nvar _lowdb = __webpack_require__(!(function webpackMissingModule() { var e = new Error(\"Cannot find module \\\"lowdb\\\"\"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));\n\nvar _lowdb2 = _interopRequireDefault(_lowdb);\n\nvar _underscore = __webpack_require__(7);\n\nvar _underscore2 = _interopRequireDefault(_underscore);\n\nvar db = (0, _lowdb2['default'])();\ndb._.mixin(_underscoreDb2['default']);\n\nfunction DBMixin(type) {\n  return _underscore2['default'].extend({}, db(type));\n}\n\nmodule.exports = exports['default'];\n\n/*****************\n ** WEBPACK FOOTER\n ** ./src/js/mixins/DBMixin.es6\n ** module id = 9\n ** module chunks = 0\n **/\n//# sourceURL=webpack:///./src/js/mixins/DBMixin.es6?");

/***/ },
/* 10 */
/***/ function(module, exports) {

	eval("module.exports = require(\"underscore-db\");\n\n/*****************\n ** WEBPACK FOOTER\n ** external \"underscore-db\"\n ** module id = 10\n ** module chunks = 0\n **/\n//# sourceURL=webpack:///external_%22underscore-db%22?");

/***/ },
/* 11 */
/***/ function(module, exports, __webpack_require__) {

	eval("'use strict';\n\nObject.defineProperty(exports, '__esModule', {\n  value: true\n});\n\nfunction _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }\n\nvar _reflux = __webpack_require__(!(function webpackMissingModule() { var e = new Error(\"Cannot find module \\\"reflux\\\"\"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));\n\nvar _reflux2 = _interopRequireDefault(_reflux);\n\nexports['default'] = _reflux2['default'].createActions({\n\n  create: {\n    asyncResult: true\n  },\n\n  update: {\n    asyncResult: true\n  },\n\n  remove: {\n    asyncResult: true\n  }\n\n});\nmodule.exports = exports['default'];\n\n/*****************\n ** WEBPACK FOOTER\n ** ./src/js/actions/CommentActions.es6\n ** module id = 11\n ** module chunks = 0\n **/\n//# sourceURL=webpack:///./src/js/actions/CommentActions.es6?");

/***/ }
/******/ ]);