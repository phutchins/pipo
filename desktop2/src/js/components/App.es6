import $ from 'jquery';
import React from 'react';
import { Link, RouteHandler } from 'react-router';


export default React.createClass({

  displayName: 'App',

  componentDidMount() {
    this.adjustHeightForBeauty();
  },

  render() {
    return (
      <div className="site">
        <div className="ui blue inverted menu">
          <Link to="index" className="item">
            <i className="home icon"></i> Home
          </Link>
          <Link to="comment" className="item">
            <i className="comment icon"></i> Comment
          </Link>
        </div>
        <div className="main container" ref="main">
          <RouteHandler/>
        </div>
      </div>
    );
  },

  adjustHeightForBeauty() {
    let mainSectionHeight = $(window).height();
    $(React.findDOMNode(this.refs.main)).css('min-height', mainSectionHeight);
  }

});
