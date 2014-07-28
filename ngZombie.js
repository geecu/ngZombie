(function(){
    var $controllerProvider;
    var $injector;
    var origCtrlRegister;
    var hooks = {};

    var storage = window.localStorage;
    var storagePrefix = 'ngzombie-';
    var storageEnabledKey = storagePrefix + 'enabled';
    var storageEnabled = storage.getItem(storageEnabledKey);
    var enabledHooks = [];
    if (storageEnabled && storageEnabled.length) {
        enabledHooks = storageEnabled.split(',');
    }

    var NgZombie = function() {
        this.afterCtrl = function(ctrlName, description, callback) {
            registerHook('ctrl-after', ctrlName, description, callback);

            return this;
        }
    }
    var ngZombie = new NgZombie();

    function zombieCtrlRegister() {
        var ctrlName = arguments[0];
        var deps; var callback; var callbackIdx = 0;
        var newCallback;
        if (typeof arguments[1] == 'function') {
            callbackIdx = 1;
        } else {
            deps = arguments[1];
            callbackIdx = 2;
        }

        callback = arguments[callbackIdx];
        if (!deps) {
            deps = $injector.annotate(callback);
        }

        newCallback = function() {
            //beforeCtrlHook(ctrlName, arguments);
            callback.apply(callback, arguments);
            afterCtrlHook.apply(this, [ctrlName, arguments]);
        }
        deps.push(newCallback);
        arguments[1] = deps;
        delete(arguments[2]);
        origCtrlRegister.apply(null, arguments);
    }

    function register(_$controllerProvider, _$injector) {
        $controllerProvider = _$controllerProvider;
        $injector = _$injector;
        origCtrlRegister = $controllerProvider.register;
        $controllerProvider.register = zombieCtrlRegister;
    }

    function provider() {
        var enabled;
        this.disable = function() {
            enabled = false;
            $controllerProvider.register = origCtrlRegister;
        }

        this.enable = function() {
            enabled = true;
            $controllerProvider.register = zombieCtrlRegister;
        }

        this.hostsAutoEnableRegex = /(\.dev|\.lo|\.?localhost)$/;

        this.$get = ['$location', function($location) {
            if (typeof(enabled) == 'undefined') {
                //the app didn't explicitely enable nor disable the zombie, guess using the location
                if ($location.host().match(this.hostsAutoEnableRegex)) {
                    this.enable();
                } else {
                    this.disable();
                }
            }

            ngZombie.enabled = enabled;

            return ngZombie;
        }];
    }

    var panelTemplate = '<style type="text/css">' +
	'#ng-zombie-panel { position: absolute; top: 0; right: 0; background-color: #fff;z-index: 1000; padding: 3px; opacity: .5; }' +
	'#ng-zombie-panel:hover { opacity: 1; }' +
	'#ng-zombie-panel h4 { cursor: pointer; }' +
	'#ng-zombie-panel ul { display: none; margin: 0; padding: 0; }' +
	'#ng-zombie-panel.open ul { display: block; }' +
	'#ng-zombie-panel.open label { display: inline-block; }' +
	'</style>' +
	'<div id="ng-zombie-panel" ng-class="{open: open}">'+
        '<h4 ng-click="open = !open">ngZombie</h4>'+
        '<ul>'+
            '<li ng-repeat="(type, hook) in hooks">'+
                '{{type}}'+
                '<ul>'+
                    '<li ng-repeat="(ctrlName, definitions) in hook">'+
                        '{{ctrlName}}'+
                        '<ul>'+
                            '<li ng-repeat="definition in definitions">'+
                                '<input type="checkbox" ng-model="definition.enabled" id="{{definition.id}}"> '+
                                '<label for="{{definition.id}}">'+
                                    '{{definition.description}}'+
                                '</label>'+
                            '</li>'+
                        '</ul>'+
                    '</li>'+
                '</ul>'+
            '</li>'+
        '</ul>'+
        '</div>';

    function panelDirective($window) {
        return {
            restrict: 'E',
            scope: {},
            template: ngZombie.enabled ? panelTemplate : '',
            link: function(scope, element, attrs) {
                scope.open = false;
                scope.hooks = hooks;
                scope.$watch('hooks', function(newValue, oldValue){
                    var _enabledHooks = [];

                    angular.forEach(hooks, function(controllers, types){
                        angular.forEach(controllers, function(definitions, controller){
                            angular.forEach(definitions, function(definition, controller){
                                if (definition.enabled) {
                                    _enabledHooks.push(definition.id);
                                }
                            });
                        });
                    });

                    //angular invokes the $watch callback on the first run, don't reload window if no hook was enabled/disabled
                    var diff = [];
                    angular.forEach(enabledHooks, function(hookId){
                        if (_enabledHooks.indexOf(hookId) === -1) {
                            diff.push(hookId);
                        }
                    });
                    angular.forEach(_enabledHooks, function(hookId){
                        if (enabledHooks.indexOf(hookId) === -1) {
                            diff.push(hookId);
                        }
                    });

                    if (diff.length) {
                        enabledHooks = _enabledHooks;
                        storage.setItem(storageEnabledKey, enabledHooks);
                        $window.location.reload();
                    }
                }, true);
            }
        }
    }

    function registerHook(type, name, description, callback) {
        if (!hooks[type]) {
            hooks[type] = {};
        }
        if (!hooks[type][name]) {
            hooks[type][name] = [];
        }

        var id = type + '-' + name + '+' + hooks[type][name].length;
        var enabled = false;
        if (enabledHooks.indexOf(id) !== -1) {
            enabled = true;
        }

        hooks[type][name].push({
            id: id,
            description: description,
            callback: callback,
            enabled: enabled
        });
    }

    function invokeHook(type, name, args) {
        if (hooks[type] && hooks[type][name]) {
            var hook = hooks[type][name];
            angular.forEach(hook, function(definition){
                if (definition.enabled) {
                    definition.callback.apply(this, args);
                }
            }, this);
        }
    }

    function beforeCtrlHook(ctrlName, args) {
        invokeHook('ctrl-before', ctrlName, args);
    }
    function afterCtrlHook(ctrlName, args) {
        invokeHook('ctrl-after', ctrlName, args);
    }

    angular.module('ngZombie', [])
        .config(['$controllerProvider', '$injector', register])
        .provider('ngZombie', provider)
        .directive('ngZombiePanel', ['$window', panelDirective])
    ;
})();
