/**
 * @module pipo/utils
 * @license LGPL-3.0
 */

'use strict';

/**
 * Dynamically sorts an object by a particular property
 * @param {String} property - The name of the field to sort by
 */
module.exports.dynamicSort = function(property) {
  var sortOrder = 1;
  if(property[0] === "-") {
    sortOrder = -1;
    property = property.substr(1);
  }
  return function (a,b) {
    var result = (a[property] < b[property]) ? -1 : (a[property] > b[property]) ? 1 : 0;
    return result * sortOrder;
  };
};

/**
 * Finds the location of the cursor in a text field
 * @param {HTMLImputElement} - The text field from which to retrieve the cursor location
 */
module.exports.getCaret = function(el) {
  if (el.selectionStart) {
    return el.selectionStart;
  } else if (document.selection) {
    el.focus();
    var r = document.selection.createRange();
    if (r === null) {
      return 0;
    }
    var re = el.createTextRange(),
        rc = re.duplicate();
    re.moveToBookmark(r.getBookmark());
    rc.setEndPoint('EndToStart', re);
    return rc.text.length;
  }
  return 0;
};

/**
 * Empty function stub
 + @private
 */
module.exports.noop = function() {};
