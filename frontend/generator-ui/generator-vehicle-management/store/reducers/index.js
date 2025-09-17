import {combineReducers} from 'redux';
import vehicles from './Vehicles.reducer';

const reducer = combineReducers({
    vehicles,
});

export default reducer;
