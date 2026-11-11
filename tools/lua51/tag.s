# TEST-ONLY: the exception tag setjmp/longjmp throw with (wasi-libc's rt.c refers to it; zig's libc does not define it).
	.tagtype __c_longjmp i32
	.globl __c_longjmp
__c_longjmp:
