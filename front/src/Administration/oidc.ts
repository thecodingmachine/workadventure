
export const refresh = async () => {
    const refresh_token = window.localStorage.getItem('refresh_token');
    const response = await fetch(
        `${process.env.REACT_APP_OIDC_URI_BASE}/refresh-tokens`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ refresh_token }),
        },
    );
    if (!response.ok) {
        throw new Error();
    }
    const { id_token } = await response.json();
    window.localStorage.setItem('id_token', id_token);
}
