const app = require('ampersand-app');
const Reflux = require('reflux');
const StateMixin = require('reflux-state-mixin');
const schemaStream = require('mongodb-schema').stream;
const toNS = require('mongodb-ns');

const _ = require('lodash');
const ReadPreference = require('mongodb').ReadPreference;

/**
 * The default read preference.
 */
const READ = ReadPreference.PRIMARY_PREFERRED;

// stores
const NamespaceStore = require('hadron-reflux-store').NamespaceStore;

// actions
const SchemaAction = require('../action');

const debug = require('debug')('mongodb-compass:stores:schema');
// const metrics = require('mongodb-js-metrics')();

const DEFAULT_MAX_TIME_MS = 10000;
const DEFAULT_NUM_DOCUMENTS = 1000;

/**
 * The reflux store for the schema.
 */
const SchemaStore = Reflux.createStore({

  mixins: [StateMixin.store],
  listenables: SchemaAction,

  /**
   * Initialize the document list store.
   */
  init: function() {
    NamespaceStore.listen((ns) => {
      if (ns && toNS(ns).collection) {
        this._reset();
        SchemaAction.startSampling();
      }
    });

    this.samplingStream = null;
    this.analyzingStream = null;
    this.samplingTimer = null;
    this.trickleStop = null;
  },

  /**
   * Initialize the schema store.
   *
   * @return {Object} initial schema state.
   */
  getInitialState() {
    return {
      samplingState: 'initial',
      samplingProgress: 0,
      samplingTimeMS: 0,
      maxTimeMS: DEFAULT_MAX_TIME_MS,
      schema: null
    };
  },


  _reset: function() {
    this.setState(this.getInitialState());
  },

  setMaxTimeMS(maxTimeMS) {
    this.setState({
      maxTimeMS: maxTimeMS
    });
  },

  resetMaxTimeMS() {
    this.setState({
      maxTimeMS: DEFAULT_MAX_TIME_MS
    });
  },

  stopSampling() {
    if (this.samplingTimer) {
      clearInterval(this.samplingTimer);
      this.samplingTimer = null;
    }
    if (this.samplingStream) {
      this.samplingStream.destroy();
      this.samplingStream = null;
    }
    if (this.analyzingStream) {
      this.analyzingStream.destroy();
      this.analyzingStream = null;
    }
  },

  /**
   * This function is called when the collection filter changes.
   */
  startSampling() {
    const QueryStore = app.appRegistry.getStore('Query.Store');
    const query = QueryStore.state.query;

    if (_.includes(['counting', 'sampling', 'analyzing'], this.state.samplingState)) {
      return;
    }

    const ns = NamespaceStore.ns;
    if (!ns) {
      return;
    }

    this.setState({
      samplingState: 'counting',
      samplingProgress: -1,
      samplingTimeMS: 0,
      schema: null
    });

    const options = {
      maxTimeMS: this.state.maxTimeMS,
      query: query,
      size: DEFAULT_NUM_DOCUMENTS,
      fields: null,
      readPreference: READ
    };

    const samplingStart = new Date();
    this.samplingTimer = setInterval(() => {
      this.setState({
        samplingTimeMS: new Date() - samplingStart
      });
    }, 1000);

    this.samplingStream = app.dataService.sample(ns, options);
    this.analyzingStream = schemaStream();
    let schema;

    const onError = () => {
      this.setState({
        samplingState: 'error'
      });
      this.stopSampling();
    };

    const onSuccess = (_schema) => {
      this.setState({
        samplingState: 'complete',
        samplingTimeMS: new Date() - samplingStart,
        samplingProgress: 100,
        schema: _schema
      });
      this.stopSampling();
    };

    const countOptions = { maxTimeMS: this.state.maxTimeMS, readPreference: READ };
    app.dataService.count(ns, query, countOptions, (err, count) => {
      if (err) {
        return onError(err);
      }

      this.setState({
        samplingState: 'sampling',
        samplingProgress: 0,
        samplingTimeMS: new Date() - samplingStart
      });
      const numSamples = Math.min(count, DEFAULT_NUM_DOCUMENTS);
      let sampleCount = 0;

      this.samplingStream
        .on('error', (sampleErr) => {
          return onError(sampleErr);
        })
        .pipe(this.analyzingStream)
        .once('progress', () => {
          this.setState({
            samplingState: 'analyzing',
            samplingTimeMS: new Date() - samplingStart
          });
        })
        .on('progress', () => {
          sampleCount ++;
          const newProgress = Math.ceil(sampleCount / numSamples * 100);
          if (newProgress > this.state.samplingProgress) {
            this.setState({
              samplingProgress: Math.ceil(sampleCount / numSamples * 100),
              samplingTimeMS: new Date() - samplingStart
            });
          }
        })
        .on('data', (data) => {
          schema = data;
        })
        .on('error', (analysisErr) => {
          onError(analysisErr);
        })
        .on('end', () => {
          if ((numSamples === 0 || sampleCount > 0) && this.state.samplingState !== 'error') {
            onSuccess(schema);
          } else {
            return onError();
          }
        });
    });
  },

  storeDidUpdate(prevState) {
    debug('schema store changed from', prevState, 'to', this.state);
  }

});

module.exports = SchemaStore;
