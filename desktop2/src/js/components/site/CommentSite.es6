import React from 'react';
import Reflux from 'reflux';
import _ from 'underscore';
import CommentStore from 'stores/CommentStore';
import CommentActions from 'actions/CommentActions';


function getStoreState() {
  return {
    comments: CommentStore.value() || []
  };
}


export default React.createClass({

  displayName: 'CommentSite',

  mixins: [
    Reflux.listenTo(CommentStore, 'onStoreChange')
  ],

  getInitialState() {
    return getStoreState();
  },

  onStoreChange() {
    this.setState(getStoreState());
  },

  onCreateComment() {
    let comment = React.findDOMNode(this.refs.newComment);
    CommentActions.create(comment.value);
    comment.value = '';
    comment.focus();
    return false;
  },

  onRemoveComment(commentID) {
    CommentActions.remove(commentID);
  },

  render() {
    return (
      <div className="ui minimal comments">
        <h3 className="ui dividing header">Comments</h3>
        { _.map(this.state.comments, (comment) => (
          <div className="comment" key={ comment.id }>
            <a className="avatar">
              <img src={ comment.user.avatar } />
            </a>
            <div className="content">
              <a className="author">{ comment.user.name }</a>
              <div className="metadata">
                <span className="date">
                  { comment.createdAt }
                </span>
              </div>
              <div className="text">
              { comment.content }
              </div>
              <div className="actions">
                <a className="reply">
                  Reply
                </a>
                <a className="remove"
                    onClick={ _.partial(this.onRemoveComment, comment.id) }>
                  Remove
                </a>
              </div>
            </div>
          </div>
        )) }
        <form className="ui reply form">
          <div className="field">
            <textarea name="content" ref="newComment"></textarea>
          </div>
          <div className="ui blue labeled submit icon button"
              onClick={ this.onCreateComment }>
            <i className="icon edit"></i> Add Reply
          </div>
        </form>
      </div>
    );
  }

});
