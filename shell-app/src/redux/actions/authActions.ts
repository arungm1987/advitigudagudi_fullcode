import {
  clearCredentials,
} from "../slices";


export const logoutAction =
  () => (dispatch: any) => {


    dispatch(
      clearCredentials()
    );


  };