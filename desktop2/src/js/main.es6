import React from 'react';
import Router, { HashLocation, Route } from 'react-router';
import App from 'components/App';
import IndexSite from 'components/site/IndexSite';
import CommentSite from 'components/site/CommentSite';


let routes = (
  <Route handler={ App }>
    <Route name="index" path="/" handler={ IndexSite }/>
    <Route name="comment" path="/comment" handler={ CommentSite }/>
  </Route>
);


Router.run(routes, HashLocation, (Root) => {
  React.render(<Root/>, document.body);
});
