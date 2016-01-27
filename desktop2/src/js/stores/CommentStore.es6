import Reflux from 'reflux';
import { Promise } from 'q';
import DBMixin from 'mixins/DBMixin';
import CommentActions from 'actions/CommentActions';


export default Reflux.createStore({

  mixins: [new DBMixin('comment')],

  listenables: [CommentActions],

  onRemove(commentID) {
    CommentActions.remove.promise(
      new Promise((resolve) => {
        this.removeById(commentID);
        resolve();
        this.trigger();
      })
    );
  },

  onCreate(content) {
    CommentActions.create.promise(
      new Promise((resolve) => {
        let comment = this.insert({
          content,
          createdAt: new Date(),
          user: {
            name: 'Foo',
            avatar: 'http://semantic-ui.com/images/avatar/small/matt.jpg'
          }
        });
        resolve(comment);
        this.trigger(comment);
      })
    );
  },

  onUpdate(commentID, content) {
    CommentActions.update.promise(
      new Promise((resolve) => {
        let comment = this.updateById(commentID, {
          content
        });
        resolve(comment);
        this.trigger(comment);
      })
    );
  }

});
