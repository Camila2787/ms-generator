import React from 'react';
import { Redirect } from 'react-router-dom';
import i18n from './i18n'

const auth = ["VEHICLE_READ"];

export const MicroFrontendConfig = {
    settings: {
        layout: {}
    },
    auth,
    routes: [
        { 
            path: '/vehicle-mng/vehicles/:vehicleId/:vehicleHandle?',
            component: React.lazy(() => import('./vehicle/Vehicle'))
        },
        {
            path: '/vehicle-mng/vehicles',
            component: React.lazy(() => import('./vehicles/Vehicles'))
        },
        {
            path: '/vehicle-mng',
            component: () => <Redirect to="/vehicle-mng/vehicles" />
        }
    ],
    navigationConfig: [
        {
            'id': 'settings',
            'type': 'collapse',
            'icon': 'settings',
            'priority': 100,
            children: [{
                'id': 'generator-vehicle-management',
                'type': 'item',
                'icon': 'business',
                'url': '/vehicle-mng',
                'priority': 2000,
                auth
            }]
        }
    ],
    i18nLocales: i18n.locales
};

