WA.onInit().then(() => {
    console.log('Trying to read variable "doorOpened" whose default property is true. This should display "true".');
    console.log('doorOpened', WA.state.loadVariable('doorOpened'));

    console.log('Trying to set variable "not_exists". This should display an error in the console, followed by a log saying the error was caught.')
    WA.state.saveVariable('not_exists', 'foo').catch((e) => {
        console.log('Successfully caught error: ', e);
    });

    console.log('Trying to set variable "myvar". This should work.');
    WA.state.saveVariable('myvar', {'foo': 'bar'});

    console.log('Trying to read variable "myvar". This should display a {"foo": "bar"} object.');
    console.log(WA.state.loadVariable('myvar'));

    console.log('Trying to set variable "myvar" using proxy. This should work.');
    WA.state.myvar = {'baz': 42};

    console.log('Trying to read variable "myvar" using proxy. This should display a {"baz": 42} object.');
    console.log(WA.state.myvar);

    console.log('Trying to set variable "config". This should not work because we are not logged as admin.');
    WA.state.saveVariable('config', {'foo': 'bar'}).catch(e => {
        console.log('Successfully caught error because variable "config" is not writable: ', e);
    });

    console.log('Trying to read variable "readableByAdmin" that can only be read by "admin". We are not admin so we should not get the default value.');
    if (WA.state.readableByAdmin === true) {
        console.error('Failed test: readableByAdmin can be read.');
    } else {
        console.log('Success test: readableByAdmin was not read.');
    }
});
