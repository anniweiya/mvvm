!(function () {
    let MVVM = function (options) {
        let self = this;
        self._options = options || {};
        let data = self._data = self._options.data;
        Object.keys(data).forEach(function (key) {
            self._proxyData(key);
        });
        self._initComputed();
        observe(data, self);
        self._compile = new Compile(self._options.el || document.body, self);
    };
    MVVM.prototype = {
        _proxyData: function (key, setter) {
            let self = this;
            Object.defineProperty(self, key, {
                configurable: false,
                enumerable: true,
                get: function proxyGetter() {
                    return self._data[key];
                },
                set: function proxySetter(newVal) {
                    self._data[key] = newVal;
                }
            });
        },
        _initComputed: function () {
            let self = this, computed = self._options.computed;
            if (typeof computed === 'object') {
                Object.keys(computed).forEach(function (key) {
                    Object.defineProperty(self, key, {
                        get: typeof computed[key] === 'function' ? computed[key] : computed[key].get,
                        set: function () {
                        }
                    });
                })
            }
        }
    };

    function observe(data) {
        if (!data || typeof data !== 'object') {
            return;
        }
        return new Observer(data);
    }

    let Observer = function (data) {
        let self = this;
        self._data = data;
        self._defineReactive(data);
    };
    Observer.prototype = {
        _defineReactive: function (data) {
            let self = this, dep = new Dep();
            Object.keys(data).forEach(function (key) {
                let val = data[key], childObj = observe(val);
                Object.defineProperty(self._data, key, {
                    enumerable: true,
                    configurable: false,
                    get: function () {
                        if (Dep.target) {
                            dep._depend();
                        }
                        return val;
                    },
                    set: function (newVal) {
                        if (newVal === val) {
                            return;
                        }
                        val = newVal;
                        childObj = observe(newVal);
                        dep._notify();
                    }
                });
            });
        }
    };
    let uid = 0;
    let Dep = function () {
        let self = this;
        self.id = uid++;
        self.subs = [];
    };
    Dep.prototype = {
        _depend: function () {
            Dep.target._addDep(this)
        },
        _notify: function () {
            this.subs.forEach(function (sub) {
                sub._update();
            })
        },
        _addSub: function (sub) {
            this.subs.push(sub)
        }
    };
    Dep.target = null;
    let Compile = function ($el, mvvm) {
        let self = this;
        self._mvvm = mvvm;
        let $node = self.$el = self._isElementNode($el) ? $el : document.querySelector($el);
        if ($node) {
            let $fragment = self.$fragment = self._node2Fragment($node);
            self._init();
            $node.appendChild($fragment);
        }
    };
    Compile.prototype = {
        _init: function () {
            let self = this;
            self._compileElement(self.$fragment);
        },
        _node2Fragment: function ($node) {
            let fragment = document.createDocumentFragment(), child;
            while (child = $node.firstChild) {
                fragment.appendChild(child);
            }
            return fragment;
        },
        _compileElement: function ($node) {
            let childNodes = $node.childNodes, self = this;
            [].slice.call(childNodes).forEach(function ($subNode) {
                let text = $subNode.textContent, reg = /{{(.*)}}/;
                if (self._isElementNode($subNode)) {
                    self._compile($subNode);
                } else if (self._isTextNode($subNode) && reg.test(text)) {
                    self._compileText($subNode, RegExp.$1);
                }
                if ($node.childNodes && $subNode.childNodes.length) {
                    self._compileElement($subNode);
                }
            });
        },
        _compile: function ($node) {
            let nodeAttrs = $node.attributes, self = this;
            [].slice.call(nodeAttrs).forEach(function (attr) {
                let attrName = attr.name;
                if (self._isDirective(attrName)) {
                    let exp = attr.value;
                    let prefix = attrName.substring(2);
                    if (self._isEventDirective(prefix)) {
                        compileUtil._eventHandler($node, self._mvvm, exp, prefix)
                    } else {
                        compileUtil[prefix] && compileUtil[prefix]($node, self._mvvm, exp)
                    }
                    $node.removeAttribute(attrName)
                }
            });
        },
        _isElementNode: function ($node) {
            return $node.nodeType === 1;
        },
        _isTextNode: function ($node) {
            return $node.nodeType === 3
        },
        _compileText: function ($node, exp) {
            let self = this;
            compileUtil.text($node, self._mvvm, exp);
        },
        _isDirective: function (attrName) {
            return attrName.indexOf('v-') === 0;
        },
        _isEventDirective: function (prefix) {
            return prefix.indexOf('on') === 0;
        }
    };
    let compileUtil = {
        text: function ($node, _mvvm, exp) {
            this.bind($node, _mvvm, exp, 'text')
        },
        html: function ($node, _mvvm, exp) {
            this.bind($node, _mvvm, exp, 'html')
        },
        class: function ($node, _mvvm, exp) {
            this.bind($node, _mvvm, exp, 'class')
        },
        bind: function ($node, _mvvm, exp, dir) {
            let updaterFn = updater[dir + 'Updater'];
            updaterFn && updaterFn($node, this._getMVVMVal(_mvvm, exp));
            new Watcher(_mvvm, exp, function (value, oldValue) {
                updaterFn && updaterFn($node, value, oldValue);
            })
        },
        model: function ($node, _mvvm, exp) {
            let self = this, val = self._getMVVMVal(_mvvm, exp);
            self.bind($node, _mvvm, exp, 'model');
            $node.addEventListener('input', function (e) {
                let newValue = e.target.value;
                if (newValue === val) {
                    return;
                }
                self._setMVVMVal(_mvvm, exp, newValue);
                val = newValue;
            })
        },
        _getMVVMVal: function (_mvvm, exp) {
            let val = _mvvm;
            exp = exp.split('.');
            exp.forEach(function (key) {
                val = val[key]
            });
            return val;
        },
        _setMVVMVal: function (_mvvm, exp, value) {
            let self = _mvvm;
            exp = exp.split('.');
            exp.forEach(function (k, i) {
                if (i < exp.length - 1) {
                    self = self[k];
                } else {
                    self[k] = value;
                }
            })
        },
        _eventHandler: function (node, _mvvm, exp, prefix) {
            let eventType = prefix.split(':')[1], fn = _mvvm._options.methods && _mvvm._options.methods[exp];
            if (eventType && fn) {
                node.addEventListener(eventType, fn.bind(_mvvm), false)
            }
        }
    };
    let Watcher = function (_mvvm, expOrFn, cb) {
        let self = this;
        self._cb = cb;
        self._mvvm = _mvvm;
        self._expOrFN = expOrFn;
        self._depIds = {};
        if (typeof expOrFn === 'function') {
            self.getter = expOrFn
        } else {
            self.getter = self._parseGetter(expOrFn);
        }
        self._value = self._get();
    };
    Watcher.prototype = {
        _update: function () {
            this._run()
        },
        _run: function () {
            let self = this;
            let value = self._get(), oldVal = self.value;
            if (value !== oldVal) {
                self._value = value;
                self._cb.call(self._mvvm, value, oldVal);
            }
        },
        _addDep: function (dep) {
            let self = this;
            if (!self._depIds.hasOwnProperty(dep.id)) {
                dep._addSub(this);
                self._depIds[dep.id] = dep;
            }
        },
        _parseGetter: function (exp) {
            if (/[^\w.$]/.test(exp)) return;
            let exps = exp.split('.');
            return function (obj) {
                for (let i = 0, len = exps.length; i < len; i++) {
                    if (!obj) return;
                    obj = obj[exps[i]];
                }
                return obj;
            }
        },
        _get: function () {
            let self = this;
            Dep.target = self;
            let value = self.getter.call(self._mvvm, self._mvvm);
            Dep.target = null;
            return value;
        }
    };
    let updater = {
        textUpdater: function ($node, value) {
            $node.textContent = typeof value === 'undefined' ? '' : value;
        },
        htmlUpdater: function ($node, value) {
            $node.innerHTML = typeof value === 'undefined' ? '' : value;
        },
        classUpdater: function ($node, value, oldValue) {
            let className = $node.className, space;
            className = className.replace(oldValue, '').replace(/\s$/, '');
            space = className && String(value) ? ' ' : '';
            $node.className = className + space + value;
        },
        modelUpdater: function ($node, value) {
            $node.value = typeof value === 'undefined' ? '' : value;
        },
    };
    window.MVVM = MVVM;
})();
