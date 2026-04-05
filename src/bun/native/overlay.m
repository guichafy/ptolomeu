#import <AppKit/AppKit.h>

// Delegate that hides the window instead of closing it
@interface OverlayWindowDelegate : NSObject <NSWindowDelegate>
@property (nonatomic, weak) id originalDelegate;
@end

@implementation OverlayWindowDelegate

- (BOOL)windowShouldClose:(NSWindow *)sender {
    // Hide the window instead of closing
    [sender orderOut:nil];
    return NO;
}

// Forward any other delegate methods to the original delegate
- (BOOL)respondsToSelector:(SEL)aSelector {
    if (aSelector == @selector(windowShouldClose:)) return YES;
    if (self.originalDelegate && [self.originalDelegate respondsToSelector:aSelector]) return YES;
    return [super respondsToSelector:aSelector];
}

- (id)forwardingTargetForSelector:(SEL)aSelector {
    if (self.originalDelegate && [self.originalDelegate respondsToSelector:aSelector]) {
        return self.originalDelegate;
    }
    return [super forwardingTargetForSelector:aSelector];
}

@end

static OverlayWindowDelegate *overlayDelegate = nil;

void makeWindowOverlay(void *nsWindowPtr) {
    NSWindow *window = (__bridge NSWindow *)nsWindowPtr;
    dispatch_async(dispatch_get_main_queue(), ^{
        // Install our delegate to intercept close
        if (!overlayDelegate) {
            overlayDelegate = [[OverlayWindowDelegate alloc] init];
            overlayDelegate.originalDelegate = window.delegate;
            window.delegate = overlayDelegate;
        }

        [window setCollectionBehavior:
            NSWindowCollectionBehaviorMoveToActiveSpace |
            NSWindowCollectionBehaviorFullScreenAuxiliary];
        [window setLevel:NSStatusWindowLevel];
        [window orderFrontRegardless];
        [NSApp activateIgnoringOtherApps:YES];
    });
}

void hideWindowOverlay(void *nsWindowPtr) {
    NSWindow *window = (__bridge NSWindow *)nsWindowPtr;
    dispatch_async(dispatch_get_main_queue(), ^{
        [window orderOut:nil];
    });
}

void removeWindowOverlay(void *nsWindowPtr) {
    NSWindow *window = (__bridge NSWindow *)nsWindowPtr;
    dispatch_async(dispatch_get_main_queue(), ^{
        // Restore original delegate
        if (overlayDelegate && overlayDelegate.originalDelegate) {
            window.delegate = overlayDelegate.originalDelegate;
        }
        overlayDelegate = nil;
        [window setCollectionBehavior:NSWindowCollectionBehaviorDefault];
        [window setLevel:NSNormalWindowLevel];
    });
}
