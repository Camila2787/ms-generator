import React, {useRef} from 'react';
import {FusePageCarded} from '@fuse';
import { useSelector } from 'react-redux';
import withReducer from 'app/store/withReducer';
import VehiclesTable from './VehiclesTable';
import VehiclesHeader from './VehiclesHeader';
import reducer from '../store/reducers';
import {FuseLoading} from '@fuse';

import VehiclesFilterHeader from './VehiclesFilterHeader';
import VehiclesFilterContent from './VehiclesFilterContent';

function Vehicles()
{
    const user = useSelector(({ auth }) => auth.user);
    const pageLayout = useRef(null);

    
    if(!user.selectedOrganization){
        return (<FuseLoading />);
    }

    return (
        <FusePageCarded
            classes={{
                content: "flex",
                //header : "min-h-72 h-72 sm:h-136 sm:min-h-136" // default tall/short header
                header: "min-h-72 h-72 sm:h-72 sm:min-h-72" // short header always
            }}
            header={
                <VehiclesHeader pageLayout={pageLayout} />
            }
            content={
                <VehiclesTable/>
            }

            leftSidebarHeader={
                <VehiclesFilterHeader/>
            }
            leftSidebarContent={
                <VehiclesFilterContent/>
            }
            ref={pageLayout}
            innerScroll
            leftSidebarVariant='permanent'
        />
    );
}

export default withReducer('VehicleManagement', reducer)(Vehicles);
