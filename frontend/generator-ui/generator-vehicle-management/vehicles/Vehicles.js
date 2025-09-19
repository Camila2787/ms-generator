import React, {useRef} from 'react';
import {FusePageCarded} from '@fuse';
import { useSelector } from 'react-redux';
import withReducer from 'app/store/withReducer';
import VehiclesTable from './VehiclesTable';
import VehiclesHeader from './VehiclesHeader';
import LiveGeneratedList from './LiveGeneratedList';
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
        <div className="flex flex-col h-full">
            {/* Header fuera del FusePageCarded */}
            <div className="bg-gray-100 p-24" style={{ minHeight: '180px' }}>
                <VehiclesHeader pageLayout={pageLayout} />
            </div>
            
            {/* Contenido principal */}
            <FusePageCarded
                classes={{
                    content: "flex flex-col", // apilamos lista en vivo + tabla
                    header: "hidden" // ocultamos el header del FusePageCarded
                }}
                header={<div></div>} // header vacío
                content={
                    <div className="w-full">
                        {/* Lista en vivo virtualizada */}
                        <LiveGeneratedList />

                        {/* Tabla CRUD existente */}
                        <div className="mt-16">
                            <VehiclesTable/>
                        </div>
                    </div>
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
        </div>
    );
}

export default withReducer('VehicleManagement', reducer)(Vehicles);
