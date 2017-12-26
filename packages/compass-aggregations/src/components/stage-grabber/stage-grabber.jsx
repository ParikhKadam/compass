import React, { PureComponent } from 'react';
import classnames from 'classnames';

import styles from './stage-grabber.less';

/**
 * Grab a stage component.
 */
class StageGrabber extends PureComponent {
  static displayName = 'StageGrabberComponent';

  /**
   * Render the stage grabber component.
   *
   * @returns {Component} The component.
   */
  render() {
    return (
      <div className={classnames(styles['stage-grabber'])}>
        <i className="fa fa-bars fa-rotate-90" aria-hidden />
      </div>
    );
  }
}

export default StageGrabber;
