import underscoreDB from 'underscore-db';
import low from 'lowdb';
import _ from 'underscore';


let db = low();
db._.mixin(underscoreDB);


export default function DBMixin(type) {
  return _.extend({}, db(type));
}
