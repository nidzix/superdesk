/**
 * This file is part of Superdesk.
 *
 * Copyright 2013, 2014 Sourcefabric z.u. and contributors.
 *
 * For the full copyright and license information, please see the
 * AUTHORS and LICENSE files distributed with this source code, or
 * at https://www.sourcefabric.org/superdesk/license
 */

(function() {

    'use strict';

    /**
     * Service for highlights with caching.
     */
    HighlightsService.$inject = ['api', '$q', '$cacheFactory', 'packages'];
    function HighlightsService(api, $q, $cacheFactory, packages) {
        var service = {};
        var cache = $cacheFactory('highlightList');

        /**
         * Fetches and caches highlights, or returns from the cache.
         */
        service.get = function get(desk) {
            var DEFAULT_CACHE_KEY = '_nodesk';
            var key = desk || DEFAULT_CACHE_KEY;
            var value = cache.get(key);

            if (value) {
                return $q.when(value);
            } else {
                var criteria = {};
                if (desk) {
                    criteria = {where: {'$or': [
                                                {'desks': desk},
                                                {'desks': {'$size': 0}}
                                               ]
                                        }
                                };
                }

                return api('highlights').query(criteria)
                .then(function(result) {
                    cache.put(key, result);
                    return $q.when(result);
                });
            }
        };

        /**
         * Clear user cache
         */
        service.clearCache = function() {
            cache.removeAll();
        };

        /**
         * Mark an item for a highlight
         */
        service.mark_item = function mark_item(highlight, marked_item) {
            return api.markForHighlights.create({highlights: highlight, marked_item: marked_item})
                .then(function(result) {
                    return result;
                });
        };

        /**
         * Create empty highlight package
         */
        service.createEmptyHighlight = function createEmptyHighlight(highlight) {
            var pkg_defaults = {
                headline: highlight.name,
                highlight: highlight._id
            };

            return packages.createEmptyPackage(pkg_defaults);
        };

        return service;
    }

    MarkHighlightsDropdownDirective.$inject = ['desks', 'highlightsService'];
    function MarkHighlightsDropdownDirective(desks, highlightsService) {
        return {
            templateUrl: 'scripts/superdesk-highlights/views/mark_highlights_dropdown_directive.html',
            link: function(scope) {

                scope.mark_item = function mark_item(highlight) {
                    highlightsService.mark_item(highlight._id, scope.item._id);
                    if (!scope.item.highlights) {
                        scope.item.highlights = [highlight._id];
                    } else {
                        scope.item.highlights = [highlight._id].concat(scope.item.highlights);
                    }
                };

                scope.is_marked = function is_marked(highlight) {
                    return scope.item && scope.item.highlights && scope.item.highlights.indexOf(highlight._id) >= 0;
                };

                highlightsService.get(desks.activeDeskId).then(function(result) {
                    scope.highlights = result._items;
                });
            }
        };
    }

    HighlightsTitleDirective.$inject = ['highlightsService'];
    function HighlightsTitleDirective(highlightsService) {
        return {
            scope: {
                highlight_ids: '=highlights',
                orientation: '=?'
            },
            templateUrl: 'scripts/superdesk-highlights/views/highlights_title_directive.html',
            link: function(scope) {

                scope.$watch('highlight_ids', function(_ids) {
                    if (_ids) {
                        scope.title = '';
                        scope.length = 0;
                        highlightsService.get().then(function(result) {
                            var highlights = _.filter(result._items, function(highlight) {
                                return _ids.indexOf(highlight._id) >= 0;
                            });
                            scope.length = highlights.length;
                            _.forEach(highlights, function(highlight) {
                                scope.title += highlight.name + '\n';
                            });
                        });
                    }
                });

                scope.getTitle = function getTitle() {
                    return scope.title;
                };

                scope.getLength = function getLength() {
                    return scope.length;
                };

                scope.orientation = scope.orientation || 'right';
            }
        };
    }

    SearchHighlightsDirective.$inject = ['highlightsService'];
    function SearchHighlightsDirective(highlightsService) {
        return {
            scope: {highlight_id: '=highlight'},
            templateUrl: 'scripts/superdesk-highlights/views/search_highlights_dropdown_directive.html',
            link: function(scope) {
                scope.selectHighlight = function selectHighlight(highlight) {
                    scope.highlight_id = null;
                    if (highlight) {
                        scope.highlight_id = highlight._id;
                    }
                };

                scope.hasHighlights = function() {
                    return _.size(scope.highlights) > 0;
                };

                highlightsService.get().then(function(result) {
                    scope.highlights = result._items;
                });
            }
        };
    }

    PackageHighlightsDropdownDirective.$inject = ['superdesk', 'desks', 'highlightsService'];
    function PackageHighlightsDropdownDirective(superdesk, desks, highlightsService) {
        return {
            templateUrl: 'scripts/superdesk-highlights/views/package_highlights_dropdown_directive.html',
            link: function(scope) {

                scope.createHighlight = function createHighlight(highlight) {
                    highlightsService.createEmptyHighlight(highlight)
                    .then(function(new_package) {
                        superdesk.intent('author', 'package', new_package);
                    });
                };

                highlightsService.get(desks.activeDeskId).then(function(result) {
                    scope.highlights = result._items;
                    scope.hasHighlights = _.size(scope.highlights) > 0;
                });
            }
        };
    }

    HighlightsSettingsController.$inject = ['$scope', 'highlightsService', 'desks', 'api', 'gettext', 'notify', 'modal'];
    function HighlightsSettingsController($scope, highlightsService, desks, api, gettext, notify, modal) {

        highlightsService.get().then(function(items) {
            $scope.configurations = items;
        });

        desks.initialize().then(function() {
            $scope.desks = desks.deskLookup;
        });

        $scope.configEdit = {};
        $scope.modalActive = false;
        $scope.hours = _.range(1, 25);
        $scope.auto = {day: 'now/d', week: 'now/w'};
        var _config;

        $scope.edit = function(config) {
            $scope.message = null;
            $scope.modalActive = true;
            $scope.configEdit = _.create(config);
            $scope.assignedDesks = deskList(config.desks);
            _config = config;
            if (!$scope.configEdit.auto_insert) {
                $scope.configEdit.auto_insert = 'now/d'; // today
            }
        };

        $scope.cancel = function() {
            $scope.modalActive = false;
        };

        $scope.save = function() {
            var _new = !_config._id;
            $scope.configEdit.desks = assignedDesks();
            api.highlights.save(_config, $scope.configEdit)
            .then(function(item) {
                $scope.message = null;
                if (_new) {
                    $scope.configurations._items.unshift(item);
                }
                highlightsService.clearCache();
                $scope.modalActive = false;
            }, function(response) {
                errorMessage(response);
            });

            function errorMessage(response) {
                if (response.data && response.data._issues && response.data._issues.name && response.data._issues.name.unique) {
                    $scope.message = gettext(
                        'Highlight configuration with the same name already exists.'
                    );
                } else {
                    $scope.message = gettext('There was a problem while saving highlights configuration');
                }
            }
        };

        $scope.remove = function(config) {
            modal.confirm(gettext('Are you sure you want to delete configuration?'))
            .then(function() {
                api.highlights.remove(config).then(function() {
                    _.remove($scope.configurations._items, config);
                    notify.success(gettext('Configuration deleted.'), 3000);
                });
            });
        };

        $scope.getHourVal = function(hour) {
            return 'now-' + hour + 'h';
        };

        function deskList(arr) {
            return _.map($scope.desks, function(d) {
                return {
                    _id: d._id,
                    name: d.name,
                    included: isIncluded(arr, d._id)
                };
            });
        }

        function isIncluded(arr, id) {
            return _.findIndex(arr, function(c) { return c === id; }) > -1;
        }

        function assignedDesks() {
            return _.map(_.filter($scope.assignedDesks, {included: true}),
                function(desk) {
                    return desk._id;
                });
        }

    }

    var app = angular.module('superdesk.highlights', [
        'superdesk.desks',
        'superdesk.packaging',
        'superdesk.activity',
        'superdesk.api'
    ]);

    app
    .service('highlightsService', HighlightsService)
    .directive('sdMarkHighlightsDropdown', MarkHighlightsDropdownDirective)
    .directive('sdPackageHighlightsDropdown', PackageHighlightsDropdownDirective)
    .directive('sdHighlightsTitle', HighlightsTitleDirective)
    .directive('sdSearchHighlights', SearchHighlightsDirective)
    .config(['superdeskProvider', function(superdesk) {
        superdesk
        .activity('mark.item', {
            label: gettext('Mark item'),
            priority: 30,
            icon: 'list-plus',
            dropdown: true,
            templateUrl: 'scripts/superdesk-highlights/views/mark_highlights_dropdown.html',
            filters: [
                {action: 'list', type: 'archive'}
            ],
            condition: function(item) {return item.task && item.task.desk;}
        })
        .activity('/settings/highlights', {
            label: gettext('Highlights'),
            controller: HighlightsSettingsController,
            templateUrl: 'scripts/superdesk-highlights/views/settings.html',
            category: superdesk.MENU_SETTINGS,
            priority: -800,
            privileges: {highlights: 1}
        });
    }])
    .config(['apiProvider', function(apiProvider) {
        apiProvider.api('highlights', {
            type: 'http',
            backend: {rel: 'highlights'}
        });
        apiProvider.api('markForHighlights', {
            type: 'http',
            backend: {rel: 'marked_for_highlights'}
        });
        apiProvider.api('generate_highlights', {
            type: 'http',
            backend: {rel: 'generate_highlights'}
        });
    }]);

    return app;
})();
