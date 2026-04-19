const noop = () => undefined;

const wrap = (component) => component;

const withScope = (callback) =>
    callback({
        setExtra: noop,
    });

module.exports = {
    init: noop,
    withScope,
    captureException: noop,
    addBreadcrumb: noop,
    setUser: noop,
    wrap,
};
