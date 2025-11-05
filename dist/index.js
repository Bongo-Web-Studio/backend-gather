function settimeoutpromise(delay, fun) {
    return new Promise((resolve) => {
        setTimeout(() => {
            if (fun)
                fun(); // call the function if provided
            resolve(); // signal that timeout is done
        }, delay);
    });
}
async function run() {
    console.log("Waiting...");
    await settimeoutpromise(2000, () => console.log("Hello after 2 seconds!"));
    console.log("Done!");
}
run();
export {};
//# sourceMappingURL=index.js.map