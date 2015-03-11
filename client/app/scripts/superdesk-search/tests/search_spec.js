'use strict';

describe('search service', function() {
    beforeEach(module('templates'));
    beforeEach(module('superdesk.search'));

    it('can create base query', inject(function(search) {
        var query = search.query();
        var criteria = query.getCriteria();
        var filters = criteria.query.filtered.filter.and;
        expect(filters).toContain({not: {term: {state: 'spiked'}}});
        expect(criteria.sort).toEqual([{versioncreated: 'desc'}]);
        expect(criteria.size).toBe(25);
    }));

    it('can create query string query', inject(function($rootScope, search) {
        var criteria = search.query({q: 'test'}).getCriteria();
        expect(criteria.query.filtered.query.query_string.query).toBe('test');
    }));

    it('can set size', inject(function(search) {
        var criteria = search.query().size(10).getCriteria();
        expect(criteria.size).toBe(10);
    }));

    it('can sort items', inject(function(search, $location, $rootScope) {
        search.setSort('urgency');
        $rootScope.$digest();
        expect($location.search().sort).toBe('urgency:desc');
        expect(search.getSort()).toEqual({label: 'News Value', field: 'urgency', dir: 'desc'});

        search.toggleSortDir();
        $rootScope.$digest();
        expect(search.getSort()).toEqual({label: 'News Value', field: 'urgency', dir: 'asc'});
    }));

    it('can be watched for changes', inject(function(search, $rootScope) {
        var criteria = search.query().getCriteria();
        expect(criteria).toEqual(search.query().getCriteria());
        expect(criteria).not.toEqual(search.query({q: 'test'}).getCriteria());
    }));
});
